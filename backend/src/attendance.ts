import type { AttendanceStatus, Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import type { AuthContext } from './auth.js'
import { isAttendanceStatus } from './attendanceWeek.js'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma } from './db.js'
import { canReachProperty, staffAccess } from './staffAccess.js'

/**
 * The nightly roll call: staff mark each resident of a property Present, Away or On leave for one IST
 * night, all at once. The marks feed the weekly email to emergency contacts (attendanceReport.ts).
 */

// More than any property's beds, so a whole roll call fits while a runaway request does not.
const maxMarksPerSave = 500

/**
 * Who is on the roll call: living there now. Pending approvals have not moved in, and moved-out or
 * removed residents have no room. Shared with the weekly email so both count the same people.
 */
export const onRollCall = { active: true, approvalPending: false, deletedAt: null, roomId: { not: null } } satisfies Prisma.ResidentWhereInput

type RollCallRequest = { propertyId: string; date: Date; isoDate: string }

/**
 * The property and night a request is about, or the reason it is refused. The property is checked
 * here because a GET's query string is not covered by staffGuard's body check; future nights are
 * refused because nobody can know yet who will be in.
 */
function parseRollCallRequest(response: Response, propertyId: unknown, rawDate: unknown): RollCallRequest | null {
  if (typeof propertyId !== 'string' || !propertyId || !canReachProperty(staffAccess(response), propertyId)) { response.status(404).json({ error: 'That property was not found.' }); return null }
  const today = propertyNow().date
  const isoDate = typeof rawDate === 'string' && rawDate ? rawDate : today
  const date = parseDateOnly(isoDate)
  if (!date) { response.status(400).json({ error: 'Choose a valid date.' }); return null }
  if (isoDate > today) { response.status(400).json({ error: 'You cannot take the roll call for a future night.' }); return null }
  return { propertyId, date, isoDate }
}

/** Everyone on the roll call with their mark for the night (null when not saved), and who last saved it. */
async function loadRollCall({ propertyId, date, isoDate }: RollCallRequest) {
  const residents = await prisma.resident.findMany({ where: { ...onRollCall, room: { propertyId } }, select: { id: true, name: true, bedNumber: true, room: { select: { number: true } }, attendanceMarks: { where: { date }, select: { status: true, markedByName: true, updatedAt: true } } } })
  const marks = residents.flatMap((resident) => resident.attendanceMarks)
  const latest = marks.reduce<(typeof marks)[number] | null>((last, mark) => (!last || mark.updatedAt > last.updatedAt ? mark : last), null)
  return {
    date: isoDate,
    today: propertyNow().date,
    saved: latest ? { by: latest.markedByName, at: latest.updatedAt } : null,
    residents: residents
      .map((resident) => ({ id: resident.id, name: resident.name, room: resident.room?.number ?? '', bed: resident.bedNumber, status: resident.attendanceMarks[0]?.status ?? null }))
      .sort((a, b) => a.room.localeCompare(b.room, 'en', { numeric: true }) || (a.bed ?? 0) - (b.bed ?? 0) || a.name.localeCompare(b.name)),
  }
}

/** Each mark sent, checked for shape; residents are checked against the property separately. */
function parseMarks(input: unknown): { marks: Array<{ residentId: string; status: AttendanceStatus }> } | { error: string } {
  if (!Array.isArray(input) || !input.length) return { error: 'Mark at least one resident.' }
  if (input.length > maxMarksPerSave) return { error: 'Too many residents in one roll call.' }
  const marks: Array<{ residentId: string; status: AttendanceStatus }> = []
  for (const item of input as Array<{ residentId?: unknown; status?: unknown }>) {
    if (typeof item?.residentId !== 'string' || !isAttendanceStatus(item.status)) return { error: 'Mark each resident Present, Away or On leave.' }
    marks.push({ residentId: item.residentId, status: item.status })
  }
  if (new Set(marks.map((mark) => mark.residentId)).size !== marks.length) return { error: 'A resident is marked twice.' }
  return { marks }
}

/** Staff routes for the Attendance page; must be mounted behind the staff guards. */
export const attendanceAdminRouter = Router()

attendanceAdminRouter.get('/attendance', async (request, response) => {
  const target = parseRollCallRequest(response, request.query.propertyId, request.query.date)
  if (!target) return
  try {
    response.json(await loadRollCall(target))
  } catch (error) {
    console.error('Loading the roll call failed:', error)
    response.status(503).json({ error: 'The roll call could not be loaded.' })
  }
})

// Saves the whole night in one transaction, so a dropped connection never leaves half a roll call.
attendanceAdminRouter.put('/attendance', async (request, response) => {
  const body = (request.body ?? {}) as { propertyId?: unknown; date?: unknown; marks?: unknown }
  if (typeof body.date !== 'string' || !body.date) { response.status(400).json({ error: 'Choose a valid date.' }); return }
  const target = parseRollCallRequest(response, body.propertyId, body.date)
  if (!target) return
  const parsed = parseMarks(body.marks)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  try {
    const residentIds = parsed.marks.map((mark) => mark.residentId)
    const onThisRollCall = await prisma.resident.count({ where: { ...onRollCall, id: { in: residentIds }, room: { propertyId: target.propertyId } } })
    if (onThisRollCall !== residentIds.length) { response.status(409).json({ error: 'Someone on this list has moved rooms or out. Reload and save again.' }); return }
    const { userId } = response.locals.auth as AuthContext
    // A copy of the name, as aadharReviewedByName does, so the record still reads right after staff leave.
    const markedByName = (await prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? null
    const { date } = target
    await prisma.$transaction(parsed.marks.map(({ residentId, status }) => prisma.attendanceMark.upsert({ where: { residentId_date: { residentId, date } }, create: { residentId, date, status, markedByName }, update: { status, markedByName } })))
    response.json(await loadRollCall(target))
  } catch (error) {
    console.error('Saving the roll call failed:', error)
    response.status(503).json({ error: 'The roll call could not be saved.' })
  }
})
