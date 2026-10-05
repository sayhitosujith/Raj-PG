import { Router } from 'express'
import { prisma } from './db.js'

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
 * Carries out an approved request by closing the account, not erasing it: every detail is kept for
 * the owner's records (shown on the Deleted records page), while the person stops being a resident.
 * They are moved out (the room is freed), their sign-in is cleared, and WhatsApp and email updates
 * stop. Their open sessions end on their next request (see accountDeletedBlock), so the portal can
 * tell them why instead of just dropping to the sign-in page.
 */
async function closeAccount(id: string) {
  const resident = await prisma.resident.findUnique({ where: { id }, select: { roomId: true, room: { select: { number: true, property: { select: { name: true } } } } } })
  if (!resident) return false
  const movedOutFrom = resident.room ? `${resident.room.property.name} · Room ${resident.room.number}` : undefined
  const now = new Date()
  await prisma.$transaction([
    prisma.resident.update({
      where: { id },
      data: {
        passwordHash: null, accessKeyHash: null, whatsappOptIn: false, emailOptIn: false, active: false, roomId: null, movedOutAt: now,
        deletionRequestedAt: null, deletionDeclinedAt: null, deletionDeclineReason: null, deletedAt: now, ...(movedOutFrom ? { movedOutFrom } : {}),
      },
    }),
    ...(resident.roomId ? [prisma.room.update({ where: { id: resident.roomId }, data: { occupied: false } })] : []),
  ])
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
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { deletedAt: true } })
  if (!resident?.deletedAt) return null
  return { message: `Your account was closed on ${resident.deletedAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}, as you asked, and you can no longer sign in. Your property owner keeps your records as the law requires.`, code: accountDeletedCode }
}
