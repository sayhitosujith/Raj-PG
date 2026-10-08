import { accountDeletedBlock } from './accountDeletion.js'
import { endStayIfOver, stayEndedCode } from './exits.js'
import { findRentLockMessage, rentLockedCode } from './rentLock.js'
import { prisma } from './db.js'

/** Sign-in refusal code for a resident a receptionist added who is not approved yet. */
export const approvalPendingCode = 'APPROVAL_PENDING'

/**
 * Why a resident may not use the app right now, with a code the web app uses to explain it, or null.
 * An erased account comes first; then one still waiting for a super admin's approval; then a stay that has ended (approved move-out date passed); then
 * overdue rent. Checked at sign-in and on every resident request, so it also ends sessions that are
 * already open.
 */
export async function findAccessBlock(residentId: string) {
  const deleted = await accountDeletedBlock(residentId)
  if (deleted) return deleted
  const waiting = await prisma.resident.findUnique({ where: { id: residentId }, select: { approvalPending: true } })
  if (waiting?.approvalPending) return { message: 'Your account is waiting for approval from your property owner. Please try again once they have approved it.', code: approvalPendingCode }
  const stayEnded = await endStayIfOver(residentId)
  if (stayEnded) return { message: stayEnded, code: stayEndedCode }
  const rentLock = await findRentLockMessage(residentId)
  if (rentLock) return { message: rentLock, code: rentLockedCode }
  return null
}
