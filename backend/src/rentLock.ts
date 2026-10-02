import type { Prisma } from '@prisma/client'
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

// Whether the resident is locked out right now, read through `client` (a transaction when recording rent).
async function lockState(client: Prisma.TransactionClient, residentId: string) {
  const [resident, settings] = await Promise.all([
    client.resident.findUnique({ where: { id: residentId }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentAccessUntil: true, rentPayments: { select: { month: true } } } }),
    getSettings(),
  ])
  return { isLocked: Boolean(resident && isRentLocked(resident, resident.rentPayments.map((payment) => payment.month), rentRulesOf(settings))), settings }
}

/** Why the resident is locked out, ready to show them, or null when they may use the app. */
export async function findRentLockMessage(residentId: string) {
  const { isLocked, settings } = await lockState(prisma, residentId)
  if (!isLocked) return null
  return `Your rent is overdue, so your access is paused. Please pay ${settings.businessName} directly; once they record it, they will give you a new access key to sign in.`
}

/**
 * Called just before rent is recorded. If overdue rent has locked the resident out, their password
 * and access key are cleared and their sessions ended, so paying never quietly restores the old
 * sign-in: the owner issues a new access key ("Send new login details"). A resident the owner let
 * in with "Allow access until" is not locked, so they keep their password. Returns whether it revoked.
 */
export async function revokeCredentialsIfLocked(client: Prisma.TransactionClient, residentId: string) {
  if (!(await lockState(client, residentId)).isLocked) return false
  await client.resident.update({ where: { id: residentId }, data: { passwordHash: null, accessKeyHash: null } })
  await client.session.deleteMany({ where: { residentId } })
  return true
}

/** What a resident whose sign-in was cleared after a lockout is told when they try their old details. */
export async function newAccessKeyMessage() {
  const { businessName } = await getSettings()
  return `Your old sign-in details stopped working after your rent was overdue. Ask ${businessName} for your new access key.`
}
