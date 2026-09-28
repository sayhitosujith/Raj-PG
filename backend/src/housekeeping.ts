import { HousekeepingSlot, HousekeepingStatus, Prisma, UserRole } from '@prisma/client'
import { Router, type Response } from 'express'
import { requireRole, type AuthContext } from './auth.js'
import { parseDateOnly, propertyUtcOffsetMs } from './dates.js'
import { prisma } from './db.js'
import { notifyHousekeeping, notifyInBackground } from './notifications.js'
import { photoVersion } from './photo.js'
import { isRentLockDue } from './rent.js'
import { requirePortalAccess } from './residentPortal.js'
import { getSettings, slotDetails } from './settings.js'
import type { WorkspaceSettings } from '@prisma/client'

const maxNoteLength = 300
const maxDaysAhead = 60
const msPerHour = 60 * 60 * 1000
const msPerDay = 24 * msPerHour
const openStatuses: HousekeepingStatus[] = [HousekeepingStatus.REQUESTED, HousekeepingStatus.SCHEDULED]
// Residents can nudge again after this long, so one missed visit cannot flood the owner.
const reminderCooldownMs = msPerHour

// What the owner may move a request to. DONE and CANCELLED are final so the history stays honest.
const allowedTransitions: Record<HousekeepingStatus, HousekeepingStatus[]> = {
  REQUESTED: [HousekeepingStatus.SCHEDULED, HousekeepingStatus.DONE, HousekeepingStatus.CANCELLED],
  SCHEDULED: [HousekeepingStatus.DONE, HousekeepingStatus.CANCELLED],
  DONE: [],
  CANCELLED: [],
}

const requestFields = { id: true, date: true, slot: true, note: true, status: true, ownerNote: true, reminderCount: true, lastReminderAt: true, reminderAcknowledgedAt: true, createdAt: true, updatedAt: true } satisfies Prisma.HousekeepingRequestSelect
type RequestRecord = Prisma.HousekeepingRequestGetPayload<{ select: typeof requestFields }>

const isSlot = (value: unknown): value is HousekeepingSlot => typeof value === 'string' && value in HousekeepingSlot
const isStatus = (value: unknown): value is HousekeepingStatus => typeof value === 'string' && value in HousekeepingStatus

/** Trimmed note, null when empty, or an error when too long. */
function parseNote(value: unknown): { note: string | null } | { error: string } {
  if (value === undefined || value === null) return { note: null }
  if (typeof value !== 'string') return { error: 'Note must be text.' }
  const note = value.trim()
  if (note.length > maxNoteLength) return { error: `Keep the note under ${maxNoteLength} characters.` }
  return { note: note || null }
}

// The resident picks a date in their own time zone (India is ahead of UTC), so "today" allows
// one day of slack before UTC today rather than rejecting a valid same-day request.
function isBookable(date: Date) {
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return date.getTime() >= todayUtc - msPerDay && date.getTime() <= todayUtc + maxDaysAhead * msPerDay
}

/** Exact start and end of a request's slot; `date` is the calendar day stored at UTC midnight. */
function slotWindow(request: Pick<RequestRecord, 'date' | 'slot'>, settings: WorkspaceSettings) {
  const dayStart = request.date.getTime() - propertyUtcOffsetMs
  const { startMinutes, endMinutes } = slotDetails(settings, request.slot)
  return { start: new Date(dayStart + startMinutes * 60_000), end: new Date(dayStart + endMinutes * 60_000) }
}

const isOpen = (request: Pick<RequestRecord, 'status'>) => openStatuses.includes(request.status)

/** A reminder the owner has not yet answered (by replying or changing the status). */
function hasOpenReminder(request: RequestRecord) {
  return isOpen(request) && request.lastReminderAt !== null && (request.reminderAcknowledgedAt === null || request.reminderAcknowledgedAt < request.lastReminderAt)
}

/**
 * Timing facts both sides need, computed here so the browser clock and time zone never decide
 * them: whether the slot is over, and from when the resident may send (another) reminder.
 */
function withTiming(request: RequestRecord, settings: WorkspaceSettings, now = new Date()) {
  const { start, end } = slotWindow(request, settings)
  const canRemindAt = isOpen(request) ? new Date(Math.max(start.getTime(), (request.lastReminderAt?.getTime() ?? 0) + reminderCooldownMs)) : null
  return { ...request, slotLabel: slotDetails(settings, request.slot).fullLabel, slotStartsAt: start, slotEndsAt: end, isOverdue: isOpen(request) && now > end, hasOpenReminder: hasOpenReminder(request), canRemindAt }
}

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Housekeeping request was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Resident routes: request, list, cancel, and send reminders for their own cleanings. */
export const housekeepingResidentRouter = Router()
const requireResident = requireRole(UserRole.RESIDENT)

housekeepingResidentRouter.get('/resident-portal/housekeeping', requireResident, requirePortalAccess, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const requests = await prisma.housekeepingRequest.findMany({ where: { residentId: userId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 30, select: requestFields })
    const settings = await getSettings()
    response.json(requests.map((request) => withTiming(request, settings)))
  } catch (error) {
    respondToError(response, error, 'Housekeeping requests could not be loaded.')
  }
})

// Counted by cleaning date within its Monday–Sunday week, so booking ahead cannot exceed the allowance.
// Cancelled requests do not count. Returns the limit when that week is full, otherwise null.
async function fullWeekLimit(residentId: string, date: Date) {
  const { housekeepingWeeklyLimit: limit } = await getSettings()
  if (!limit) return null
  const weekStart = new Date(date)
  weekStart.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7)
  const booked = await prisma.housekeepingRequest.count({ where: { residentId, date: { gte: weekStart, lt: weekEnd }, status: { not: HousekeepingStatus.CANCELLED } } })
  return booked >= limit ? limit : null
}

housekeepingResidentRouter.post('/resident-portal/housekeeping', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { date: rawDate, slot, note: rawNote } = request.body as { date?: string; slot?: unknown; note?: unknown }
  const date = parseDateOnly(rawDate)
  if (!date) { response.status(400).json({ error: 'Choose a valid date.' }); return }
  if (!isBookable(date)) { response.status(400).json({ error: `Choose a date from today up to ${maxDaysAhead} days ahead.` }); return }
  if (!isSlot(slot)) { response.status(400).json({ error: 'Choose morning, afternoon, or evening.' }); return }
  const note = parseNote(rawNote)
  if ('error' in note) { response.status(400).json({ error: note.error }); return }
  try {
    // Past the second rent reminder, new services wait until the owner records the payment.
    if (await isRentLockDue(userId)) { response.status(403).json({ error: 'Your rent is overdue. Housekeeping requests are paused until it is paid.', code: 'RENT_OVERDUE' }); return }
    const duplicate = await prisma.housekeepingRequest.count({ where: { residentId: userId, date, slot, status: { in: openStatuses } } })
    if (duplicate) { response.status(409).json({ error: 'You already have a request for that date and time.' }); return }
    const weeklyLimit = await fullWeekLimit(userId, date)
    if (weeklyLimit) { response.status(409).json({ error: `You can book up to ${weeklyLimit} cleanings a week, and that week is already full. Choose a date in another week.`, code: 'WEEKLY_LIMIT' }); return }
    response.status(201).json(withTiming(await prisma.housekeepingRequest.create({ data: { residentId: userId, date, slot, note: note.note }, select: requestFields }), await getSettings()))
  } catch (error) {
    respondToError(response, error, 'Your housekeeping request could not be saved.')
  }
})

// Scoped by residentId so residents can only ever touch their own requests.
async function findOwnRequest(id: string, residentId: string) {
  return prisma.housekeepingRequest.findFirst({ where: { id, residentId }, select: requestFields })
}

housekeepingResidentRouter.post('/resident-portal/housekeeping/:id/cancel', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  // Typed explicitly: the guards in front of this handler hide the route's param types.
  const { id } = request.params as { id: string }
  try {
    const existing = await findOwnRequest(id, userId)
    if (!existing) { response.status(404).json({ error: 'Housekeeping request was not found.' }); return }
    if (!isOpen(existing)) { response.status(409).json({ error: 'This request is already closed.' }); return }
    response.json(withTiming(await prisma.housekeepingRequest.update({ where: { id }, data: { status: HousekeepingStatus.CANCELLED }, select: requestFields }), await getSettings()))
  } catch (error) {
    respondToError(response, error, 'The request could not be cancelled.')
  }
})

// "The cleaner did not turn up": allowed once the slot has started, then at most once an hour.
housekeepingResidentRouter.post('/resident-portal/housekeeping/:id/remind', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { id } = request.params as { id: string }
  try {
    const existing = await findOwnRequest(id, userId)
    if (!existing) { response.status(404).json({ error: 'Housekeeping request was not found.' }); return }
    const settings = await getSettings()
    const { canRemindAt } = withTiming(existing, settings)
    if (!canRemindAt) { response.status(409).json({ error: 'This request is already closed.' }); return }
    const now = new Date()
    if (now < slotWindow(existing, settings).start) { response.status(409).json({ error: 'You can send a reminder once your time slot has started.' }); return }
    if (now < canRemindAt) { response.status(429).json({ error: `You already sent a reminder. You can send another after ${canRemindAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.` }); return }
    response.json(withTiming(await prisma.housekeepingRequest.update({ where: { id }, data: { reminderCount: { increment: 1 }, lastReminderAt: now }, select: requestFields }), settings))
  } catch (error) {
    respondToError(response, error, 'The reminder could not be sent.')
  }
})

/** Owner routes for the Housekeeping page; must be mounted behind the super admin guard. */
export const housekeepingAdminRouter = Router()

const withResident = { ...requestFields, resident: { select: { id: true, name: true, profilePhotoUpdatedAt: true, room: { select: { number: true, property: { select: { name: true } } } } } } } satisfies Prisma.HousekeepingRequestSelect

function toOwnerView(request: Prisma.HousekeepingRequestGetPayload<{ select: typeof withResident }>, settings: WorkspaceSettings) {
  const { resident, ...fields } = request
  return { ...withTiming(fields, settings), resident: { id: resident.id, name: resident.name, room: resident.room.number, property: resident.room.property.name, photoVersion: photoVersion(resident.profilePhotoUpdatedAt) } }
}

// Unanswered reminders first, then overdue visits, then the rest by when they are due.
const urgency = (request: ReturnType<typeof toOwnerView>) => (request.hasOpenReminder ? 0 : request.isOverdue ? 1 : 2)

housekeepingAdminRouter.get('/housekeeping', async (_request, response) => {
  try {
    const [open, closed] = await Promise.all([
      prisma.housekeepingRequest.findMany({ where: { status: { in: openStatuses } }, orderBy: [{ date: 'asc' }, { slot: 'asc' }], select: withResident }),
      prisma.housekeepingRequest.findMany({ where: { status: { notIn: openStatuses } }, orderBy: { updatedAt: 'desc' }, take: 100, select: withResident }),
    ])
    // Array.sort is stable, so within each urgency level the date order from the query is kept.
    const settings = await getSettings()
    const openViews = open.map((request) => toOwnerView(request, settings)).sort((a, b) => urgency(a) - urgency(b))
    response.json([...openViews, ...closed.map((request) => toOwnerView(request, settings))])
  } catch (error) {
    respondToError(response, error, 'Housekeeping requests could not be loaded.')
  }
})

// Either a status change (with optional note) or, with no status, a reply that only updates the
// note. Both count as the owner answering any outstanding reminder.
housekeepingAdminRouter.patch('/housekeeping/:id', async (request, response) => {
  const { status, ownerNote: rawOwnerNote } = request.body as { status?: unknown; ownerNote?: unknown }
  if (status !== undefined && !isStatus(status)) { response.status(400).json({ error: 'Choose a valid status.' }); return }
  const ownerNote = parseNote(rawOwnerNote)
  if ('error' in ownerNote) { response.status(400).json({ error: ownerNote.error }); return }
  if (status === undefined && !ownerNote.note) { response.status(400).json({ error: 'Write a reply for the resident.' }); return }
  try {
    const existing = await prisma.housekeepingRequest.findUniqueOrThrow({ where: { id: request.params.id }, select: { status: true } })
    if (status === undefined && !isOpen(existing)) { response.status(409).json({ error: 'This request is already closed.' }); return }
    if (status !== undefined && !allowedTransitions[existing.status].includes(status)) { response.status(409).json({ error: `A ${existing.status.toLowerCase()} request cannot be marked ${status.toLowerCase()}.` }); return }
    const updated = await prisma.housekeepingRequest.update({ where: { id: request.params.id }, data: { ...(status !== undefined ? { status } : {}), ...(rawOwnerNote !== undefined ? { ownerNote: ownerNote.note } : {}), reminderAcknowledgedAt: new Date() }, select: withResident })
    if (status !== undefined) notifyInBackground(() => notifyHousekeeping({ ...updated, residentId: updated.resident.id }))
    response.json(toOwnerView(updated, await getSettings()))
  } catch (error) {
    respondToError(response, error, 'The request could not be updated.')
  }
})
