import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { propertyUtcOffsetMs } from './dates.js'
import { prisma } from './db.js'
import { notifyInBackground, notifyRentRecorded } from './notifications.js'
import { getSettings, rentRulesOf, type RentRules } from './settings.js'
import { revokeCredentialsIfLocked } from './rentLock.js'
import { grantReferralReward } from './referrals.js'

/**
 * Rent cycle (days set in Settings, default due the 3rd): reminders 1, 2 and 3 show from their days
 * until the due day, and after the due day an unpaid month flags the resident
 * overdue, which locks them out of the app (rentLock.ts) unless the owner allowed access up to a date.
 * Reminders are shown in the app, and sent by email or WhatsApp when those are set up.
 */
/** Upper bound for any rent amount, in whole rupees. */
export const maxMonthlyRent = 10_00_000
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

/** Where a resident stands for rent right now. */
export type RentState = 'NOT_TRACKED' | 'NOT_DUE' | 'PAID' | 'REMINDER_1' | 'REMINDER_2' | 'REMINDER_3' | 'LOCK_DUE'

type Calendar = { year: number; month: number; day: number }

function propertyToday(now: Date): Calendar {
  const local = new Date(now.getTime() + propertyUtcOffsetMs)
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate() }
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

// The first month billed from a start date: that month if it began on or before the due day,
// otherwise the next one (someone moving in on the 20th has already settled that month on arrival).
function firstBilledMonth(start: Date, dueDay: number) {
  const { year, month, day } = propertyToday(start)
  return day <= dueDay ? { year, month } : month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

function monthsBetween(from: { year: number; month: number }, to: { year: number; month: number }) {
  const months: string[] = []
  for (let year = from.year, month = from.month; year < to.year || (year === to.year && month <= to.month); month === 12 ? (year += 1, month = 1) : (month += 1)) months.push(monthKey(year, month))
  return months
}

/** A month's discount, as the rent code needs it. */
export type MonthConcession = { month: string; percent: number; reason?: string }

/** Selects a resident's active concessions for {@link rentStatus}; add to any query whose rent figures are shown or charged. */
export const activeConcessions = { rentConcessions: { where: { status: 'ACTIVE' }, orderBy: { month: 'asc' }, select: { month: true, percent: true, reason: true } } } satisfies Prisma.ResidentSelect

/**
 * The rent for one month, before any late fee: the monthly rent less that month's concessions,
 * rounded to whole rupees. The single place a month is priced, so dues, payments, orders and
 * move-out figures always agree.
 */
export function rentForMonth(monthlyRent: number, month: string, concessions: readonly MonthConcession[] = []) {
  const percentOff = Math.min(100, concessions.filter((concession) => concession.month === month).reduce((sum, concession) => sum + concession.percent, 0))
  return monthlyRent - Math.round(monthlyRent * percentOff / 100)
}

const nextMonthKey = (month: string) => { const [year, number] = month.split('-').map(Number); return number === 12 ? monthKey(year + 1, 1) : monthKey(year, number + 1) }

/**
 * Computes a resident's rent position. Billing starts at the later of their joining date and the
 * date rent was first set, so turning rent on for an existing resident never invents back-rent.
 */
export function rentStatus(resident: { monthlyRent: number | null; rentTrackedFrom: Date | null; joinedAt: Date; active: boolean; rentConcessions?: readonly MonthConcession[] }, paidMonths: string[], rules: RentRules, now = new Date()) {
  const { dueDay } = rules
  const today = propertyToday(now)
  const currentMonth = monthKey(today.year, today.month)
  if (!resident.monthlyRent || !resident.rentTrackedFrom || !resident.active) {
    return { state: 'NOT_TRACKED' as RentState, monthlyRent: resident.monthlyRent, currentMonth, outstandingMonths: [] as string[], overdueMonths: [] as string[], amountDue: 0, dueDay, lateFee: rules.lateFee, monthAmounts: {} as Record<string, number>, concessions: [] as MonthConcession[] }
  }
  const start = resident.rentTrackedFrom > resident.joinedAt ? resident.rentTrackedFrom : resident.joinedAt
  const paid = new Set(paidMonths)
  const outstandingMonths = monthsBetween(firstBilledMonth(start, dueDay), today).filter((month) => !paid.has(month))
  // A month is overdue once its due day has passed: any earlier month, or this one after the due day.
  const overdueMonths = outstandingMonths.filter((month) => month < currentMonth || today.day > dueDay)
  const owesCurrent = outstandingMonths.includes(currentMonth)
  const state: RentState = overdueMonths.length ? 'LOCK_DUE'
    : owesCurrent && today.day >= rules.reminderThreeDay ? 'REMINDER_3'
    : owesCurrent && today.day >= rules.reminderTwoDay ? 'REMINDER_2'
    : owesCurrent && today.day >= rules.reminderOneDay ? 'REMINDER_1'
    : paid.has(currentMonth) ? 'PAID'
    : 'NOT_DUE'
  // Each month at its own price (a concession lowers just that month); overdue ones also carry the late fee.
  const concessions = resident.rentConcessions ?? []
  const { monthlyRent } = resident
  const price = (month: string) => rentForMonth(monthlyRent, month, concessions)
  // The months anyone may be asked to pay: those owed, this month and next (paying ahead).
  const monthAmounts = Object.fromEntries([...new Set([...outstandingMonths, currentMonth, nextMonthKey(currentMonth)])].map((month) => [month, price(month)]))
  const amountDue = outstandingMonths.reduce((sum, month) => sum + price(month), 0) + overdueMonths.length * rules.lateFee
  return { state, monthlyRent: resident.monthlyRent, currentMonth, outstandingMonths, overdueMonths, amountDue, dueDay, lateFee: rules.lateFee, monthAmounts, concessions: [...concessions] }
}

/**
 * The resident's next rent date in one line's worth of data, for the Overview's bed card: overdue (the
 * oldest unpaid due date and everything owed), due this month, or, when paid up, the first unpaid month
 * ahead (residents may pay months in advance). Null when rent is not tracked. Dates are YYYY-MM-DD.
 */
export function nextRentDue(status: ReturnType<typeof rentStatus>, paidMonths: string[]) {
  if (status.state === 'NOT_TRACKED' || !status.monthlyRent) return null
  const dueDate = (month: string) => `${month}-${String(status.dueDay).padStart(2, '0')}`
  if (status.overdueMonths.length) return { state: 'OVERDUE' as const, dueDate: dueDate(status.overdueMonths[0]), amount: status.amountDue }
  if (status.outstandingMonths.includes(status.currentMonth)) return { state: 'DUE' as const, dueDate: dueDate(status.currentMonth), amount: status.monthAmounts[status.currentMonth] ?? status.monthlyRent }
  const paid = new Set(paidMonths)
  let month = nextMonthKey(status.currentMonth)
  // Bounded: nobody pays years ahead, and a runaway loop must not hang the dashboard.
  for (let ahead = 0; ahead < 36 && paid.has(month); ahead += 1) month = nextMonthKey(month)
  return { state: 'UPCOMING' as const, dueDate: dueDate(month), amount: rentForMonth(status.monthlyRent, month, status.concessions) }
}

/** True when the resident is overdue (past the due day); pauses housekeeping requests during an access override. */
export async function isRentLockDue(residentId: string) {
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentPayments: { select: { month: true } } } })
  return resident ? rentStatus(resident, resident.rentPayments.map((payment) => payment.month), rentRulesOf(await getSettings())).state === 'LOCK_DUE' : false
}

/**
 * Parses the owner's monthly rent input: whole rupees, 0 or blank to stop tracking.
 * Returns the fields to write (rentTrackedFrom is set the first time rent is turned on).
 */
export function parseMonthlyRent(value: unknown, alreadyTrackedFrom: Date | null): { data: { monthlyRent: number | null; rentTrackedFrom?: Date | null } } | { error: string } | null {
  if (value === undefined) return null
  if (value === null || value === '' || value === 0 || value === '0') return { data: { monthlyRent: null } }
  const rent = typeof value === 'string' ? Number(value) : value
  if (typeof rent !== 'number' || !Number.isInteger(rent) || rent < 1 || rent > maxMonthlyRent) return { error: 'Monthly rent must be a whole number of rupees.' }
  return { data: { monthlyRent: rent, ...(alreadyTrackedFrom ? {} : { rentTrackedFrom: new Date() }) } }
}

const recentPayments = { orderBy: { month: 'desc' }, take: 6, select: { id: true, month: true, amount: true, paidAt: true, razorpayPaymentId: true } } satisfies Prisma.Resident$rentPaymentsArgs

/**
 * Rent summary for API responses: status plus the latest recorded payments. The two reads are
 * independent, so they run together: each is a round-trip to the database, and the resident
 * profile, which every open portal re-fetches each minute, waits on this.
 */
export async function rentSummary(residentId: string) {
  const [resident, payments, settings] = await Promise.all([
    prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentPayments: { select: { month: true } }, ...activeConcessions } }),
    prisma.rentPayment.findMany({ where: { residentId }, ...recentPayments }),
    getSettings(),
  ])
  return { ...rentStatus(resident, resident.rentPayments.map((payment) => payment.month), rentRulesOf(settings)), payments }
}

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Resident was not found.' }); return }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { response.status(409).json({ error: 'That month is already marked paid.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Owner routes for recording rent; must be mounted behind the super admin guard. */
export const rentAdminRouter = Router()

// Records a month as paid: the oldest unpaid month by default, or a specific "YYYY-MM" (e.g. an
// advance payment for next month). Amount defaults to that month's rent (less any concession), plus the late fee when overdue.
rentAdminRouter.post('/residents/:id/rent-payments', async (request, response) => {
  const { id } = request.params
  const { month: requestedMonth, amount: requestedAmount } = request.body as { month?: unknown; amount?: unknown }
  if (requestedMonth !== undefined && (typeof requestedMonth !== 'string' || !monthPattern.test(requestedMonth))) { response.status(400).json({ error: 'Month must look like 2026-10.' }); return }
  if (requestedAmount !== undefined && (typeof requestedAmount !== 'number' || !Number.isInteger(requestedAmount) || requestedAmount < 1 || requestedAmount > maxMonthlyRent)) { response.status(400).json({ error: 'Amount must be a whole number of rupees.' }); return }
  try {
    const status = await rentSummary(id)
    if (!status.monthlyRent) { response.status(409).json({ error: 'Set a monthly rent for this resident first.' }); return }
    const month = (requestedMonth as string | undefined) ?? status.outstandingMonths[0] ?? status.currentMonth
    const { monthlyRent } = status

    const credentialsRevoked = await prisma.$transaction(async (transaction) => {
      const revoked = await revokeCredentialsIfLocked(transaction, id)
      await transaction.rentPayment.create({ data: { residentId: id, month, amount: (requestedAmount as number | undefined) ?? rentForMonth(monthlyRent, month, status.concessions) + (status.overdueMonths.includes(month) ? status.lateFee : 0) } })
      return revoked
    })
    notifyInBackground(() => notifyRentRecorded(id, [month]))
    // A first payment by someone a resident referred earns that resident their reward.
    void grantReferralReward(id)
    response.status(201).json({ ...await rentSummary(id), credentialsRevoked })
  } catch (error) {
    respondToError(response, error, 'The payment could not be recorded.')
  }
})

// Undo for a mis-click; scoped to the resident so an id from another resident cannot be removed.
rentAdminRouter.delete('/residents/:id/rent-payments/:paymentId', async (request, response) => {
  const { id, paymentId } = request.params
  try {
    const payment = await prisma.rentPayment.findFirst({ where: { id: paymentId, residentId: id }, select: { razorpayPaymentId: true } })
    if (payment?.razorpayPaymentId) { response.status(409).json({ error: 'This was paid online, so it cannot be undone here. Refund it from the Razorpay dashboard if needed.' }); return }
    const removed = await prisma.rentPayment.deleteMany({ where: { id: paymentId, residentId: id } })
    if (!removed.count) { response.status(404).json({ error: 'Payment was not found.' }); return }
    response.json(await rentSummary(id))
  } catch (error) {
    respondToError(response, error, 'The payment could not be removed.')
  }
})
