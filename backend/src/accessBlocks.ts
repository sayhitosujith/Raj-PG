import { accountDeletedBlock } from './accountDeletion.js'
import { endStayIfOver, stayEndedCode } from './exits.js'
import { findRentLockMessage, rentLockedCode } from './rentLock.js'

/**
 * Why a resident may not use the app right now, with a code the web app uses to explain it, or null.
 * An erased account comes first; then a stay that has ended (approved move-out date passed); then
 * overdue rent. Checked at sign-in and on every resident request, so it also ends sessions that are
 * already open.
 */
export async function findAccessBlock(residentId: string) {
  const deleted = await accountDeletedBlock(residentId)
  if (deleted) return deleted
  const stayEnded = await endStayIfOver(residentId)
  if (stayEnded) return { message: stayEnded, code: stayEndedCode }
  const rentLock = await findRentLockMessage(residentId)
  if (rentLock) return { message: rentLock, code: rentLockedCode }
  return null
}
