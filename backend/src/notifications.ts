import { HousekeepingStatus, type HousekeepingSlot } from '@prisma/client'
import { formatMonthLabel } from './dates.js'
import { prisma } from './db.js'
import { displayName } from './names.js'
import { loadRentReceipt, renderRentReceipt } from './receipts.js'
import { getSettings, slotDetails } from './settings.js'
import { isWhatsAppEnabled, sendTemplate, uploadPdf, whatsappNumber } from './whatsappClient.js'

/**
 * WhatsApp notifications to residents. Each maps to a template the owner creates in Meta's
 * WhatsApp Manager (names and texts in the README), and each is sent at most once per event:
 * the dedupe key is stored with the message, so retries of the daily job or a double click never
 * message twice. Nothing is sent to residents who turned WhatsApp off or have no phone.
 */
export const templates = { rentReminder: 'rent_reminder', rentOverdue: 'rent_overdue', paymentReceived: 'payment_received', announcement: 'announcement', housekeeping: 'housekeeping_update' } as const

type Recipient = { id: string; name: string; phone: string | null; whatsappOptIn: boolean }
const recipientSelect = { id: true, name: true, phone: true, whatsappOptIn: true } as const

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

/** Sends one template message unless it was already sent for `dedupeKey`, and logs the outcome. */
async function deliver(resident: Recipient, template: string, params: string[], dedupeKey: string, attachment?: () => Promise<{ id: string; filename: string }>) {
  if (!isWhatsAppEnabled() || !resident.whatsappOptIn || !resident.phone) return
  const existing = await prisma.whatsAppMessage.findUnique({ where: { dedupeKey } })
  if (existing && existing.status !== 'failed') return
  const to = whatsappNumber(resident.phone)
  const log = existing
    ? await prisma.whatsAppMessage.update({ where: { id: existing.id }, data: { status: 'pending', error: null, to } })
    : await prisma.whatsAppMessage.create({ data: { residentId: resident.id, to, template, dedupeKey } })
  try {
    const waMessageId = await sendTemplate(to, template, params, attachment ? await attachment() : undefined)
    await prisma.whatsAppMessage.update({ where: { id: log.id }, data: { status: 'sent', waMessageId } })
  } catch (error) {
    await prisma.whatsAppMessage.update({ where: { id: log.id }, data: { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' } })
  }
}

/**
 * Runs a notification without holding up (or failing) the owner's action that triggered it; a
 * WhatsApp outage must never stop rent being recorded.
 */
export function notifyInBackground(task: () => Promise<unknown>) {
  void task().catch((error: unknown) => console.error('WhatsApp notification failed:', error))
}

/** "Received ₹15,000 for October 2026", one message per recorded month, each with its PDF receipt. */
export async function notifyRentRecorded(residentId: string, months: string[]) {
  if (!isWhatsAppEnabled() || !months.length) return
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { ...recipientSelect, room: { select: { property: { select: { name: true } } } } } })
  if (!resident) return
  const { businessName } = await getSettings()
  const payments = await prisma.rentPayment.findMany({ where: { residentId, month: { in: months } } })
  for (const payment of payments) {
    await deliver(resident, templates.paymentReceived, [displayName(resident.name), businessName, rupees(payment.amount), formatMonthLabel(payment.month), resident.room.property.name], `payment:${payment.id}`, async () => {
      const receipt = await loadRentReceipt(residentId, payment.id)
      if (!receipt) throw new Error('Receipt not found')
      const filename = `rent-receipt-${receipt.number}.pdf`
      return { id: await uploadPdf(await renderRentReceipt(receipt), filename), filename }
    })
  }
}

/** A new announcement, to every opted-in resident of its property. */
export async function notifyAnnouncement(announcement: { id: string; title: string; message: string; propertyId: string }) {
  if (!isWhatsAppEnabled()) return
  const { businessName } = await getSettings()
  const residents = await prisma.resident.findMany({ where: { active: true, room: { propertyId: announcement.propertyId } }, select: recipientSelect })
  for (const resident of residents) await deliver(resident, templates.announcement, [displayName(resident.name), businessName, announcement.title, announcement.message], `announcement:${announcement.id}:${resident.id}`)
}

const housekeepingWording: Partial<Record<HousekeepingStatus, string>> = { [HousekeepingStatus.SCHEDULED]: 'scheduled', [HousekeepingStatus.DONE]: 'completed', [HousekeepingStatus.CANCELLED]: 'cancelled' }

/** The owner scheduled, completed or cancelled a resident's cleaning request. */
export async function notifyHousekeeping(request: { id: string; residentId: string; date: Date; slot: HousekeepingSlot; status: HousekeepingStatus; ownerNote: string | null }) {
  const wording = housekeepingWording[request.status]
  if (!isWhatsAppEnabled() || !wording) return
  const resident = await prisma.resident.findUnique({ where: { id: request.residentId }, select: recipientSelect })
  if (!resident) return
  const settings = await getSettings()
  const { label, hours } = slotDetails(settings, request.slot)
  const when = `${request.date.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}, ${label} (${hours})`
  await deliver(resident, templates.housekeeping, [displayName(resident.name), settings.businessName, when, wording, request.ownerNote || 'No notes'], `housekeeping:${request.id}:${request.status}`)
}

/** A rent reminder or overdue notice; the key makes it once per resident, month and stage. */
export async function notifyRent(resident: Recipient, stage: 'reminder1' | 'reminder2' | 'overdue', details: { amount: number; months: string[]; dueDate: string; property: string }) {
  const { businessName } = await getSettings()
  const template = stage === 'overdue' ? templates.rentOverdue : templates.rentReminder
  const monthLabel = details.months.map(formatMonthLabel).join(', ')
  await deliver(resident, template, [displayName(resident.name), businessName, rupees(details.amount), monthLabel, details.property, details.dueDate], `rent:${resident.id}:${details.months[0]}:${stage}`)
}
