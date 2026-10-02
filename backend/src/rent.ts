import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { propertyUtcOffsetMs } from './dates.js'
import { prisma } from './db.js'
import { notifyInBackground, notifyRentRecorded } from './notifications.js'
import { getSettings, rentRulesOf, type RentRules } from './settings.js'
import { revokeCredentialsIfLocked } from './rentLock.js'

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

/**
 * Computes a resident's rent position. Billing starts at the later of their joining date and the
 * date rent was first set, so turning rent on for an existing resident never invents back-rent.
 */
export function rentStatus(resident: { monthlyRent: number | null; rentTrackedFrom: Date | null; joinedAt: Date; active: boolean }, paidMonths: string[], rules: RentRules, now = new Date()) {
  const { dueDay } = rules
  const today = propertyToday(now)
  const currentMonth = monthKey(today.year, today.month)
  if (!resident.monthlyRent || !resident.rentTrackedFrom || !resident.active) {
    return { state: 'NOT_TRACKED' as RentState, monthlyRent: resident.monthlyRent, currentMonth, outstandingMonths: [] as string[], overdueMonths: [] as string[], amountDue: 0, dueDay, lateFee: rules.lateFee }
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
  // Each overdue month carries the late fee on top of its rent.
  const amountDue = outstandingMonths.length * resident.monthlyRent + overdueMonths.length * rules.lateFee
  return { state, monthlyRent: resident.monthlyRent, currentMonth, outstandingMonths, overdueMonths, amountDue, dueDay, lateFee: rules.lateFee }
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

/** Rent summary for API responses: status plus the latest recorded payments. */
export async function rentSummary(residentId: string) {
  const resident = await prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentPayments: { select: { month: true } } } })
  const payments = await prisma.rentPayment.findMany({ where: { residentId }, ...recentPayments })
  return { ...rentStatus(resident, resident.rentPayments.map((payment) => payment.month), rentRulesOf(await getSettings())), payments }
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
// advance payment for next month). Amount defaults to the monthly rent, plus the late fee when that month is overdue.
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
      await transaction.rentPayment.create({ data: { residentId: id, month, amount: (requestedAmount as number | undefined) ?? monthlyRent + (status.overdueMonths.includes(month) ? status.lateFee : 0) } })
      return revoked
    })
    notifyInBackground(() => notifyRentRecorded(id, [month]))
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
