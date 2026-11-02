import { Router } from 'express'
import { prisma } from './db.js'
import { syncDoorAccess } from './doorAccess.js'

/** Records the resident's "Delete my account" request; false when they already asked or the account is closed. */
export async function requestAccountDeletion(residentId: string) {
  const updated = await prisma.resident.updateMany({ where: { id: residentId, deletionRequestedAt: null, deletedAt: null }, data: { deletionRequestedAt: new Date(), deletionDeclinedAt: null, deletionDeclineReason: null } })
  return updated.count > 0
}

/** Withdraws a pending request before the owner decides; false when there is none. */
export async function cancelAccountDeletion(residentId: string) {
  const updated = await prisma.resident.updateMany({ where: { id: residentId, deletionRequestedAt: { not: null } }, data: { deletionRequestedAt: null } })
  return updated.count > 0
}

/**
 * Closes an account, not erasing it: every detail is kept for the owner's records (shown on the
 * Deleted records page), while the person stops being a resident. Used for an approved "Delete my
 * account" request, and when a staff member removes a resident (`removedBy` names them). They are
 * moved out (the bed is freed), their sign-in and door access key are cleared, and WhatsApp and email
 * updates stop. Their open sessions end on their next request (see accountDeletedBlock), so the
 * portal can tell them why instead of just dropping to the sign-in page.
 */
export async function closeAccount(id: string, removedBy?: string) {
  const resident = await prisma.resident.findUnique({ where: { id }, select: { roomId: true, room: { select: { number: true, property: { select: { name: true } } } } } })
  if (!resident) return false
  const movedOutFrom = resident.room ? `${resident.room.property.name} · Room ${resident.room.number}` : undefined
  const now = new Date()
  await prisma.$transaction(async (transaction) => {
    await transaction.resident.update({
      where: { id },
      data: {
        passwordHash: null, accessKeyHash: null, passkeys: { deleteMany: {} }, doorAccessKey: null, doorAccessKeyRevokedAt: null, whatsappOptIn: false, emailOptIn: false, active: false, roomId: null, bedNumber: null, movedOutAt: now,
        deletionRequestedAt: null, deletionDeclinedAt: null, deletionDeclineReason: null, deletedAt: now, deletedByName: removedBy ?? null, ...(movedOutFrom ? { movedOutFrom } : {}),
      },
    })
    await syncDoorAccess(transaction, { residentId: id }, removedBy ? 'Removed from residents' : 'Account deleted')
  })
  return true
}

/** Owner routes for account deletion requests; mounted behind the super admin guard. */
export const accountDeletionAdminRouter = Router()

const maxDeclineReasonLength = 300

// Approve (close the account now) or decline with a reason (the request is cleared, the account carries on, and
// the resident sees the reason). Dues do not block approval: the owner sees them and decides.
accountDeletionAdminRouter.post('/residents/:id/deletion/decision', async (request, response) => {
  const { decision, reason } = request.body as { decision?: unknown; reason?: unknown }
  if (decision !== 'approve' && decision !== 'decline') { response.status(400).json({ error: 'Decision must be approve or decline.' }); return }
  const declineReason = typeof reason === 'string' ? reason.trim() : ''
  if (decision === 'decline' && !declineReason) { response.status(400).json({ error: 'Give the resident a reason for declining.' }); return }
  if (declineReason.length > maxDeclineReasonLength) { response.status(400).json({ error: `Keep the reason under ${maxDeclineReasonLength} characters.` }); return }
  const { id } = request.params
  try {
    const pending = await prisma.resident.findFirst({ where: { id, deletionRequestedAt: { not: null }, deletedAt: null }, select: { id: true } })
    if (!pending) { response.status(409).json({ error: 'There is no pending deletion request for this resident.' }); return }
    if (decision === 'decline') await prisma.resident.update({ where: { id }, data: { deletionRequestedAt: null, deletionDeclinedAt: new Date(), deletionDeclineReason: declineReason } })
    else await closeAccount(id)
    response.status(204).send()
  } catch (error) {
    console.error('Account deletion decision failed:', error)
    response.status(503).json({ error: 'The deletion request could not be updated.' })
  }
})

/** The response code for a resident whose account was closed, so the web app can explain the sign-out. */
export const accountDeletedCode = 'ACCOUNT_DELETED'

/** Why a resident whose account was closed can no longer use the app, ready to show them, or null for everyone else. */
export async function accountDeletedBlock(residentId: string) {
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { deletedAt: true, deletedByName: true } })
  if (!resident?.deletedAt) return null
  const when = resident.deletedAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })
  const how = resident.deletedByName ? 'by your property owner' : 'as you asked'
  return { message: `Your account was closed on ${when}, ${how}, and you can no longer sign in. Your property owner keeps your records as the law requires.`, code: accountDeletedCode }
}
