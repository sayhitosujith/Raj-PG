import { prisma } from './db.js'
import { isRentLocked } from './rentLock.js'
import { getSettings, rentRulesOf } from './settings.js'

/** Audit log author for changes the app makes on its own, so they are not mistaken for a person's. */
export const systemActor = { staffId: 'system', staffName: 'Automatic', staffRole: 'SYSTEM' }

/**
 * Removes the door access key of every resident whom overdue rent locks out (the day after the rent
 * due day in Settings, unless the owner allowed access until a date), as part of the daily cron run.
 * The app cannot reach the lock itself, so each removal is stamped on the resident and written to the
 * audit log: both tell the owner to delete the PIN from the lock as well.
 */
export async function revokeOverdueDoorAccess() {
  const rules = rentRulesOf(await getSettings())
  const holders = await prisma.resident.findMany({ where: { doorAccessKey: { not: null } }, select: { id: true, name: true, monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentAccessUntil: true, rentPayments: { select: { month: true } }, room: { select: { property: { select: { id: true, name: true } } } } } })
  const overdue = holders.filter((resident) => isRentLocked(resident, resident.rentPayments.map((payment) => payment.month), rules))
  let revoked = 0
  for (const resident of overdue) {
    const now = new Date()
    // Conditional, so a key the owner replaced or removed meanwhile is left alone and not logged twice.
    const { count } = await prisma.resident.updateMany({ where: { id: resident.id, doorAccessKey: { not: null } }, data: { doorAccessKey: null, doorAccessKeyRevokedAt: now } })
    if (!count) continue
    revoked += 1
    const property = resident.room?.property
    await prisma.staffActivity.create({ data: { ...systemActor, action: `Removed ${resident.name}'s door access key: rent overdue. Delete the PIN from the lock too.`, propertyId: property?.id ?? null, propertyName: property?.name ?? null, createdAt: now } })
  }
  return { checked: holders.length, revoked }
}
