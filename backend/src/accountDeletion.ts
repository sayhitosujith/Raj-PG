import { Router } from 'express'
import { prisma } from './db.js'

/** What an erased resident is called in the owner's lists, so their rent history still reads sensibly. */
export const deletedResidentName = 'Deleted resident'

/** Records the resident's "Delete my account" request; false when they already asked or were erased. */
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
 * Carries out an approved request. The resident row stays, so rent payments, receipts and meal and
 * housekeeping history keep their link and the owner's accounts still add up; everything that
 * identifies the person is cleared instead: contact details, ID numbers and scans, photo, address,
 * emergency contact and sign-in. They are moved out of their room; their open sessions are ended on
 * their next request (see accountDeletedBlock), so the portal can tell them why instead of just
 * dropping to the sign-in page.
 * Bookings that became this resident lose their copied name and contact too, and the WhatsApp/email
 * log forgets the number or address it sent to. Hand-recorded payments keep the payer name and
 * phone the owner typed, since those are the owner's financial records.
 */
async function eraseResident(id: string) {
  const resident = await prisma.resident.findUnique({ where: { id }, select: { roomId: true, room: { select: { number: true, property: { select: { name: true } } } } } })
  if (!resident) return false
  const movedOutFrom = resident.room ? `${resident.room.property.name} · Room ${resident.room.number}` : undefined
  const now = new Date()
  await prisma.$transaction([
    prisma.resident.update({
      where: { id },
      data: {
        name: deletedResidentName, phone: null, email: null, aadharNumber: null, aadharCardUrl: null, permanentAddress: null,
        passportNumber: null, passportExpiry: null, passportScanUrl: null, visaNumber: null, visaType: null, visaExpiry: null,
        emergencyContactName: null, emergencyContactRelation: null, emergencyContactPhone: null,
        profilePhotoUrl: null, profilePhotoUpdatedAt: null, passwordHash: null, accessKeyHash: null,
        whatsappOptIn: false, emailOptIn: false, active: false, roomId: null, movedOutAt: now,
        deletionRequestedAt: null, deletionDeclinedAt: null, deletionDeclineReason: null, deletedAt: now, ...(movedOutFrom ? { movedOutFrom } : {}),
      },
    }),
    ...(resident.roomId ? [prisma.room.update({ where: { id: resident.roomId }, data: { occupied: false } })] : []),
    prisma.booking.updateMany({ where: { residentId: id }, data: { residentName: deletedResidentName, phone: '', email: null, message: '' } }),
    prisma.outboundMessage.updateMany({ where: { residentId: id }, data: { to: '' } }),
  ])
  return true
}

/** Owner routes for account deletion requests; mounted behind the super admin guard. */
export const accountDeletionAdminRouter = Router()

const maxDeclineReasonLength = 300

// Approve (erase now) or decline with a reason (the request is cleared, the account carries on, and
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
    else await eraseResident(id)
    response.status(204).send()
  } catch (error) {
    console.error('Account deletion decision failed:', error)
    response.status(503).json({ error: 'The deletion request could not be updated.' })
  }
})

/** The response code for a resident whose account was erased, so the web app can explain the sign-out. */
export const accountDeletedCode = 'ACCOUNT_DELETED'

/** Why an erased resident can no longer use the app, ready to show them, or null for everyone else. */
export async function accountDeletedBlock(residentId: string) {
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { deletedAt: true } })
  if (!resident?.deletedAt) return null
  return { message: `Your account was deleted on ${resident.deletedAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}, as you asked. Your personal details have been erased and you can no longer sign in.`, code: accountDeletedCode }
}
