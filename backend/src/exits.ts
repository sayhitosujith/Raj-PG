import { ExitStatus } from '@prisma/client'
import { Router } from 'express'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma } from './db.js'
import { notifyExitCancelled, notifyExitDateChanged, notifyExitDecision, notifyExitRequested, notifyInBackground } from './notifications.js'
import { rentForMonth, rentStatus, type MonthConcession, activeConcessions } from './rent.js'
import { getSettings, rentRulesOf, type RentRules } from './settings.js'

const maxReasonLength = 300

/** The response code for a resident whose stay has ended, so the web app can explain the sign-out. */
export const stayEndedCode = 'STAY_ENDED'

const longDate = (date: Date) => date.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

// Clears a resident's password, access key and passkeys and ends their sessions: from then on only a new
// access key from the owner ("Send new login details") lets them back in.
const revokeSignIn = (residentId: string) => prisma.$transaction([
  prisma.resident.update({ where: { id: residentId }, data: { passwordHash: null, accessKeyHash: null, passkeys: { deleteMany: {} } } }),
  prisma.session.deleteMany({ where: { residentId } }),
])

/**
 * Once an approved move-out date has passed (from the next day, IST), the resident's sign-in stops
 * working even if the owner has not completed the move-out yet; their password and access key are
 * cleared, so staying on needs a new key. Returns why, ready to show them, or null while it is valid.
 */
export async function endStayIfOver(residentId: string) {
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { exitStatus: true, exitDate: true } })
  if (resident?.exitStatus !== ExitStatus.APPROVED || !resident.exitDate) return null
  if (resident.exitDate.toISOString().slice(0, 10) >= propertyNow().date) return null
  await revokeSignIn(residentId)
  const { businessName } = await getSettings()
  return `Your stay ended on ${longDate(resident.exitDate)}, so your sign-in no longer works. Ask ${businessName} for a new access key if you are staying on.`
}

/**
 * A leaving resident's settlement. `months` and `total` are what must be paid before approval: earlier
 * unpaid months in full (late fee when overdue), months in between in full, and the move-out month's
 * day charge if it is unpaid. When the move-out month is already paid, `unusedCredit` is what was
 * actually paid for it (`exitMonthPaid`, which may differ from today's rent) minus the day charge, the part
 * of it they did not use, which is refunded with the deposit.
 */
export type ExitDues = {
  total: number
  months: Array<{ month: string; amount: number }>
  exitMonth: string | null
  daysStayed: number
  dailyRate: number
  dayCharge: number
  isExitMonthPaid: boolean
  exitMonthPaid: number
  unusedCredit: number
}

type DuesInput = { monthlyRent: number | null; rentTrackedFrom: Date | null; joinedAt: Date; active: boolean; exitDate: Date | null; foodOpted: boolean; rentConcessions?: readonly MonthConcession[] }

/** The two per-day rates from Settings. */
export type DailyRates = { withFood: number; withoutFood: number }
export const dailyRatesOf = (settings: { dailyRateWithFood: number; dailyRateWithoutFood: number }): DailyRates => ({ withFood: settings.dailyRateWithFood, withoutFood: settings.dailyRateWithoutFood })

const noDues: ExitDues = { total: 0, months: [], exitMonth: null, daysStayed: 0, dailyRate: 0, dayCharge: 0, isExitMonthPaid: false, exitMonthPaid: 0, unusedCredit: 0 }

// "YYYY-MM" keys from the month after `from` through `to`, inclusive.
function monthsAfter(from: string, to: string) {
  const months: string[] = []
  for (let [year, month] = from.split('-').map(Number), key = from; key < to;) {
    month === 12 ? (year += 1, month = 1) : (month += 1)
    key = `${year}-${String(month).padStart(2, '0')}`
    months.push(key)
  }
  return months
}

/**
 * The move-out settlement. The move-out month is charged per day: days stayed from the 1st through
 * the move-out date (inclusive) at the resident's rate (with or without food), never more than the
 * month's rent. Months before it are owed in full: unpaid ones now (late fee when overdue) and any
 * later ones not paid in advance.
 */
export function computeExitDues(resident: DuesInput, payments: Array<{ month: string; amount: number }>, rules: RentRules, rates: DailyRates): ExitDues {
  const paidMonths = payments.map((payment) => payment.month)
  if (!resident.exitDate || !resident.monthlyRent) return noDues
  const rent = resident.monthlyRent
  const status = rentStatus(resident, paidMonths, rules)
  const paid = new Set(paidMonths)
  const exitDay = resident.exitDate.toISOString().slice(0, 10)
  const exitMonth = exitDay.slice(0, 7)
  const daysStayed = Number(exitDay.slice(8, 10))
  const dailyRate = resident.foodOpted ? rates.withFood : rates.withoutFood
  // A concession on the move-out month comes off its day charge too.
  const dayCharge = rentForMonth(Math.min(daysStayed * dailyRate, rent), exitMonth, status.concessions)
  const isExitMonthPaid = paid.has(exitMonth)
  const exitMonthPaid = payments.filter((payment) => payment.month === exitMonth).reduce((sum, payment) => sum + payment.amount, 0)
  const isExitMonthOverdue = status.overdueMonths.includes(exitMonth)
  const fullMonths = [
    ...status.outstandingMonths.filter((month) => month !== exitMonth).map((month) => ({ month, amount: rentForMonth(rent, month, status.concessions) + (status.overdueMonths.includes(month) ? rules.lateFee : 0) })),
    ...monthsAfter(status.currentMonth, exitMonth).filter((month) => month !== exitMonth && !paid.has(month)).map((month) => ({ month, amount: rentForMonth(rent, month, status.concessions) })),
  ]
  const months = isExitMonthPaid ? fullMonths : [...fullMonths, { month: exitMonth, amount: dayCharge + (isExitMonthOverdue ? rules.lateFee : 0) }]
  return { total: months.reduce((sum, item) => sum + item.amount, 0), months, exitMonth, daysStayed, dailyRate, dayCharge, isExitMonthPaid, exitMonthPaid, unusedCredit: isExitMonthPaid ? Math.max(0, exitMonthPaid - dayCharge) : 0 }
}

/** computeExitDues for one resident, loading what it needs. */
export async function exitDues(residentId: string) {
  const [resident, settings] = await Promise.all([
    prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, exitDate: true, foodOpted: true, ...activeConcessions, rentPayments: { select: { month: true, amount: true } } } }),
    getSettings(),
  ])
  return computeExitDues(resident, resident.rentPayments, rentRulesOf(settings), dailyRatesOf(settings))
}
const dayMs = 24 * 60 * 60 * 1000

/**
 * The notice period rule on already-loaded rows: the property's own setting, otherwise the one in
 * Settings. For callers that have the property in hand, so they need not read it again.
 */
export function noticeDaysOf(property: { noticePeriodDays: number | null } | null | undefined, settings: { noticePeriodDays: number }) {
  return property?.noticePeriodDays ?? settings.noticePeriodDays
}

/** A resident's notice period in days: their property's own setting, otherwise the one in Settings. */
export async function noticeDaysFor(residentId: string) {
  const [resident, settings] = await Promise.all([prisma.resident.findUnique({ where: { id: residentId }, select: { room: { select: { property: { select: { noticePeriodDays: true } } } } } }), getSettings()])
  return noticeDaysOf(resident?.room?.property, settings)
}

/** The earliest move-out date allowed today for a notice period: that many days from today (IST), never today itself. */
export function earliestExitDate(noticeDays: number) {
  const today = Date.parse(`${propertyNow().date}T00:00:00Z`)
  return new Date(today + Math.max(1, noticeDays) * dayMs).toISOString().slice(0, 10)
}

/**
 * The resident's own move-out notice. Validated against the notice period; only one request may be
 * open (pending or approved) at a time, and a declined one can be replaced. The owner is emailed.
 */
export async function requestExit(residentId: string, body: { moveOutDate?: unknown; reason?: unknown }) {
  const date = typeof body.moveOutDate === 'string' ? parseDateOnly(body.moveOutDate) : null
  if (!date) return { error: 'Choose your move-out date.' }
  const earliest = earliestExitDate(await noticeDaysFor(residentId))
  if (date.toISOString().slice(0, 10) < earliest) return { error: `With the notice period, the earliest move-out date is ${earliest}.` }
  if (body.reason !== undefined && typeof body.reason !== 'string') return { error: 'Reason must be text.' }
  const reason = (body.reason as string | undefined)?.trim() ?? ''
  if (reason.length > maxReasonLength) return { error: `Keep the reason under ${maxReasonLength} characters.` }
  const current = await prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { exitStatus: true } })
  if (current.exitStatus === ExitStatus.PENDING || current.exitStatus === ExitStatus.APPROVED) return { error: 'You already have a move-out request. Cancel it first to change the date.' }
  await prisma.resident.update({ where: { id: residentId }, data: { exitStatus: ExitStatus.PENDING, exitDate: date, exitReason: reason || null, exitRequestedAt: new Date() } })
  notifyInBackground(() => notifyExitRequested(residentId))
  return { ok: true as const }
}

/** The resident withdraws a request the owner has not yet approved. */
/**
 * The resident withdraws their move-out, pending or approved (not once completed). Cancelling an
 * approved one emails the owner, since they may have planned around it.
 */
export async function cancelExit(residentId: string) {
  const current = await prisma.resident.findUnique({ where: { id: residentId }, select: { exitStatus: true, exitDate: true, movedOutAt: true } })
  const isOpen = current?.exitStatus === ExitStatus.PENDING || current?.exitStatus === ExitStatus.APPROVED
  if (!current || !isOpen || current.movedOutAt) return false
  await prisma.resident.update({ where: { id: residentId }, data: { exitStatus: null, exitDate: null, exitReason: null, exitRequestedAt: null } })
  if (current.exitStatus === ExitStatus.APPROVED && current.exitDate) {
    const cancelledDate = current.exitDate
    notifyInBackground(() => notifyExitCancelled(residentId, cancelledDate))
  }
  return true
}

/** Owner routes for move-out requests; mounted behind the super admin guard. */
export const exitAdminRouter = Router()

// Approve or decline a pending request; the resident is emailed either way.
exitAdminRouter.post('/residents/:id/exit/decision', async (request, response) => {
  const { decision } = request.body as { decision?: unknown }
  if (decision !== 'approve' && decision !== 'decline') { response.status(400).json({ error: 'Decision must be approve or decline.' }); return }
  // Approval waits until every rupee up to the move-out date is recorded as paid.
  if (decision === 'approve') {
    const dues = await exitDues(request.params.id).catch(() => null)
    if (!dues) { response.status(404).json({ error: 'Resident was not found.' }); return }
    if (dues.total > 0) { response.status(409).json({ error: `Clear ₹${dues.total.toLocaleString('en-IN')} in dues up to the move-out date before approving.` }); return }
  }
  const updated = await prisma.resident.updateMany({ where: { id: request.params.id, exitStatus: ExitStatus.PENDING }, data: { exitStatus: decision === 'approve' ? ExitStatus.APPROVED : ExitStatus.DECLINED } })
  if (!updated.count) { response.status(409).json({ error: 'There is no pending move-out request for this resident.' }); return }
  notifyInBackground(() => notifyExitDecision(request.params.id, decision === 'approve'))
  response.status(204).send()
})

// The owner moves a pending or approved request to another date (from today on; the notice period is
// the resident's minimum, not the owner's). Dues and refund follow the new date; the resident is emailed.
exitAdminRouter.post('/residents/:id/exit/date', async (request, response) => {
  const { moveOutDate } = request.body as { moveOutDate?: unknown }
  const date = typeof moveOutDate === 'string' ? parseDateOnly(moveOutDate) : null
  if (!date) { response.status(400).json({ error: 'Choose a valid move-out date.' }); return }
  if (date.toISOString().slice(0, 10) < propertyNow().date) { response.status(400).json({ error: 'The move-out date cannot be in the past.' }); return }
  // Extending a stay whose approved date has already passed still needs a new access key: this
  // clears the old sign-in first if that date is behind us.
  await endStayIfOver(request.params.id)
  const updated = await prisma.resident.updateMany({ where: { id: request.params.id, movedOutAt: null, exitStatus: { in: [ExitStatus.PENDING, ExitStatus.APPROVED] } }, data: { exitDate: date } })
  if (!updated.count) { response.status(409).json({ error: 'There is no open move-out request for this resident.' }); return }
  notifyInBackground(() => notifyExitDateChanged(request.params.id))
  response.status(204).send()
})

/**
 * Completes an approved move-out on or after its date: the resident becomes inactive and is signed
 * out, gives up the room (free for the next resident at once), and keeps their record and rent
 * history, with movedOutFrom noting where they lived.
 */
exitAdminRouter.post('/residents/:id/exit/complete', async (request, response) => {
  const { id } = request.params
  try {
    const resident = await prisma.resident.findUnique({ where: { id }, select: { exitStatus: true, exitDate: true, roomId: true, room: { select: { number: true, property: { select: { name: true } } } } } })
    if (!resident) { response.status(404).json({ error: 'Resident was not found.' }); return }
    if (resident.exitStatus !== ExitStatus.APPROVED || !resident.exitDate) { response.status(409).json({ error: 'Approve the move-out request first.' }); return }
    if (resident.exitDate.toISOString().slice(0, 10) > propertyNow().date) { response.status(409).json({ error: `The move-out date is ${resident.exitDate.toISOString().slice(0, 10)}; complete it on or after that day.` }); return }
    // A later date can bring new dues after approval, so they must be clear here too.
    const dues = await exitDues(id)
    if (dues.total > 0) { response.status(409).json({ error: `Clear ₹${dues.total.toLocaleString('en-IN')} in dues before completing the move-out.` }); return }
    const movedOutFrom = resident.room ? `${resident.room.property.name} · Room ${resident.room.number}` : null
    await prisma.$transaction([
      // Their password, access key and door access key are cleared too, so moving back in needs a new access key.
      prisma.resident.update({ where: { id }, data: { active: false, roomId: null, movedOutAt: new Date(), passwordHash: null, accessKeyHash: null, doorAccessKey: null, doorAccessKeyRevokedAt: null, passkeys: { deleteMany: {} }, ...(movedOutFrom ? { movedOutFrom } : {}) } }),
      prisma.session.deleteMany({ where: { residentId: id } }),
    ])
    response.status(204).send()
  } catch (error) {
    console.error('Completing the move-out failed:', error)
    response.status(503).json({ error: 'The move-out could not be completed.' })
  }
})
