import { propertyNow } from './dates.js'
import { prisma } from './db.js'
import { rentStatus } from './rent.js'
import { getSettings, rentRulesOf, type RentRules } from './settings.js'

/** The response code a locked-out resident gets, so the web app can explain instead of just signing out. */
export const rentLockedCode = 'RENT_LOCKED'

type LockInput = { monthlyRent: number | null; rentTrackedFrom: Date | null; joinedAt: Date; active: boolean; rentAccessUntil: Date | null }

/**
 * True when overdue rent locks the resident out completely: from the first day after the due day
 * until the month is paid or recorded, unless the owner allowed access up to a date that is still
 * today or later ("YYYY-MM-DD" comparison in property-local time, so it ends at midnight IST).
 */
export function isRentLocked(resident: LockInput, paidMonths: string[], rules: RentRules, now = new Date()) {
  if (rentStatus(resident, paidMonths, rules, now).state !== 'LOCK_DUE') return false
  return !(resident.rentAccessUntil && resident.rentAccessUntil.toISOString().slice(0, 10) >= propertyNow(now).date)
}

/** Why the resident is locked out, ready to show them, or null when they may use the app. */
export async function findRentLockMessage(residentId: string) {
  const [resident, settings] = await Promise.all([
    prisma.resident.findUnique({ where: { id: residentId }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentAccessUntil: true, rentPayments: { select: { month: true } } } }),
    getSettings(),
  ])
  if (!resident || !isRentLocked(resident, resident.rentPayments.map((payment) => payment.month), rentRulesOf(settings))) return null
  return `Your rent is overdue, so your access is paused. Please pay ${settings.businessName} directly; you can sign in again as soon as they record the payment.`
}
