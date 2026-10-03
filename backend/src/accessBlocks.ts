import { endStayIfOver, stayEndedCode } from './exits.js'
import { findRentLockMessage, rentLockedCode } from './rentLock.js'

/**
 * Why a resident may not use the app right now, with a code the web app uses to explain it, or null.
 * A stay that has ended (approved move-out date passed) comes first; then overdue rent. Checked at
 * sign-in and on every resident request, so it also ends sessions that are already open.
 */
export async function findAccessBlock(residentId: string) {
  const stayEnded = await endStayIfOver(residentId)
  if (stayEnded) return { message: stayEnded, code: stayEndedCode }
  const rentLock = await findRentLockMessage(residentId)
  if (rentLock) return { message: rentLock, code: rentLockedCode }
  return null
}
