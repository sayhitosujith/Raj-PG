import { HousekeepingStatus, type HousekeepingSlot } from '@prisma/client'
import { formatMonthLabel } from './dates.js'
import { prisma } from './db.js'
import { isEmailAddress, isEmailEnabled, sendEmail } from './emailClient.js'
import { announcementEmail, bookingAlertEmail, paymentReceivedEmail, rentReminderEmail } from './emailTemplates.js'
import { displayName } from './names.js'
import { loadRentReceipt, renderRentReceipt } from './receipts.js'
import { getSettings, slotDetails } from './settings.js'
import { isWhatsAppEnabled, sendTemplate, uploadPdf, whatsappNumber } from './whatsappClient.js'

/**
 * Notifications to residents (and the owner) by WhatsApp and email. WhatsApp messages are templates
 * the owner creates in Meta's WhatsApp Manager (names and texts in the README); emails are built in
 * emailTemplates.ts. Every message is sent at most once per event and channel: its dedupe key is
 * stored in OutboundMessage, so retries of the daily job or a double click never message twice.
 * Residents who turned a channel off get nothing on it, except receipts by email (they are records).
 */
export const templates = { rentReminder: 'rent_reminder', rentOverdue: 'rent_overdue', paymentReceived: 'payment_received', announcement: 'announcement', housekeeping: 'housekeeping_update' } as const

type Channel = 'whatsapp' | 'email'
type Recipient = { id: string; name: string; phone: string | null; email: string | null; whatsappOptIn: boolean; emailOptIn: boolean }
export const recipientSelect = { id: true, name: true, phone: true, email: true, whatsappOptIn: true, emailOptIn: true } as const

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`
/** Where links in emails point; the web app's public address. */
const appUrl = () => (process.env.APP_URL || 'https://raj-pg.netlify.app').replace(/\/$/, '')

/**
 * Sends one message unless it was already sent under `dedupeKey`, and logs the outcome. WhatsApp
 * keys stay unprefixed (as they were before email existed); email keys start "email:".
 */
async function deliver(channel: Channel, residentId: string | null, to: string, kind: string, key: string, send: () => Promise<string | null>) {
  const dedupeKey = channel === 'email' ? `email:${key}` : key
  const existing = await prisma.outboundMessage.findUnique({ where: { dedupeKey } })
  if (existing && existing.status !== 'failed') return
  const log = existing
    ? await prisma.outboundMessage.update({ where: { id: existing.id }, data: { status: 'pending', error: null, to } })
    : await prisma.outboundMessage.create({ data: { channel, residentId, to, kind, dedupeKey } })
  try {
    await prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'sent', providerMessageId: await send() } })
  } catch (error) {
    await prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' } })
  }
}

function toWhatsApp(resident: Recipient, template: string, params: string[], key: string, attachment?: () => Promise<{ id: string; filename: string }>) {
  if (!isWhatsAppEnabled() || !resident.whatsappOptIn || !resident.phone) return Promise.resolve()
  const to = whatsappNumber(resident.phone)
  return deliver('whatsapp', resident.id, to, template, key, async () => sendTemplate(to, template, params, attachment ? await attachment() : undefined))
}

function toEmail(resident: Recipient, kind: string, message: { subject: string; html: string; text: string }, key: string, options: { ignoreOptOut?: boolean; attachments?: () => Promise<Array<{ filename: string; content: Buffer }>> } = {}) {
  if (!isEmailEnabled() || !isEmailAddress(resident.email) || (!resident.emailOptIn && !options.ignoreOptOut)) return Promise.resolve()
  const to = resident.email
  return deliver('email', resident.id, to, kind, key, async () => sendEmail({ to, ...message, attachments: options.attachments ? await options.attachments() : undefined }))
}

/**
 * Runs a notification without holding up (or failing) the owner's action that triggered it; a
 * WhatsApp or email outage must never stop rent being recorded.
 */
export function notifyInBackground(task: () => Promise<unknown>) {
  void task().catch((error: unknown) => console.error('Notification failed:', error))
}

/** "Received ₹15,000 for October 2026", one message per recorded month, each with its PDF receipt. */
export async function notifyRentRecorded(residentId: string, months: string[]) {
  if ((!isWhatsAppEnabled() && !isEmailEnabled()) || !months.length) return
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { ...recipientSelect, room: { select: { property: { select: { name: true } } } } } })
  if (!resident) return
  const { businessName } = await getSettings()
  const payments = await prisma.rentPayment.findMany({ where: { residentId, month: { in: months } } })
  for (const payment of payments) {
    // Rendered once and shared by both channels.
    let pdf: Promise<{ filename: string; content: Buffer }> | null = null
    const receiptPdf = () => (pdf ??= loadRentReceipt(residentId, payment.id).then(async (receipt) => {
      if (!receipt) throw new Error('Receipt not found')
      return { filename: `rent-receipt-${receipt.number}.pdf`, content: await renderRentReceipt(receipt) }
    }))
    const name = displayName(resident.name)
    const month = formatMonthLabel(payment.month)
    await toWhatsApp(resident, templates.paymentReceived, [name, businessName, rupees(payment.amount), month, resident.room.property.name], `payment:${payment.id}`, async () => {
      const { filename, content } = await receiptPdf()
      return { id: await uploadPdf(content, filename), filename }
    })
    await toEmail(resident, 'payment_received', paymentReceivedEmail({ business: businessName, name, amount: rupees(payment.amount), month, property: resident.room.property.name }), `payment:${payment.id}`, { ignoreOptOut: true, attachments: async () => [await receiptPdf()] })
  }
}

/** A new announcement, to every resident of its property who has the channel on. */
export async function notifyAnnouncement(announcement: { id: string; title: string; message: string; propertyId: string }) {
  if (!isWhatsAppEnabled() && !isEmailEnabled()) return
  const { businessName } = await getSettings()
  const residents = await prisma.resident.findMany({ where: { active: true, room: { propertyId: announcement.propertyId } }, select: { ...recipientSelect, room: { select: { property: { select: { name: true } } } } } })
  for (const resident of residents) {
    const name = displayName(resident.name)
    await toWhatsApp(resident, templates.announcement, [name, businessName, announcement.title, announcement.message], `announcement:${announcement.id}:${resident.id}`)
    await toEmail(resident, 'announcement', announcementEmail({ business: businessName, name, title: announcement.title, message: announcement.message, property: resident.room.property.name }), `announcement:${announcement.id}:${resident.id}`)
  }
}

const housekeepingWording: Partial<Record<HousekeepingStatus, string>> = { [HousekeepingStatus.SCHEDULED]: 'scheduled', [HousekeepingStatus.DONE]: 'completed', [HousekeepingStatus.CANCELLED]: 'cancelled' }

/** The owner scheduled, completed or cancelled a resident's cleaning request (WhatsApp only). */
export async function notifyHousekeeping(request: { id: string; residentId: string; date: Date; slot: HousekeepingSlot; status: HousekeepingStatus; ownerNote: string | null }) {
  const wording = housekeepingWording[request.status]
  if (!isWhatsAppEnabled() || !wording) return
  const resident = await prisma.resident.findUnique({ where: { id: request.residentId }, select: recipientSelect })
  if (!resident) return
  const settings = await getSettings()
  const { label, hours } = slotDetails(settings, request.slot)
  const when = `${request.date.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}, ${label} (${hours})`
  await toWhatsApp(resident, templates.housekeeping, [displayName(resident.name), settings.businessName, when, wording, request.ownerNote || 'No notes'], `housekeeping:${request.id}:${request.status}`)
}

/** A rent reminder or overdue notice; the key makes it once per resident, month, stage and channel. */
export async function notifyRent(resident: Recipient, stage: 'reminder1' | 'reminder2' | 'overdue', details: { amount: number; months: string[]; dueDate: string; property: string }) {
  const { businessName } = await getSettings()
  const name = displayName(resident.name)
  const monthLabel = details.months.map(formatMonthLabel).join(', ')
  const key = `rent:${resident.id}:${details.months[0]}:${stage}`
  await toWhatsApp(resident, stage === 'overdue' ? templates.rentOverdue : templates.rentReminder, [name, businessName, rupees(details.amount), monthLabel, details.property, details.dueDate], key)
  await toEmail(resident, stage === 'overdue' ? 'rent_overdue' : 'rent_reminder', rentReminderEmail({ business: businessName, name, amount: rupees(details.amount), months: monthLabel, property: details.property, dueDate: details.dueDate, overdue: stage === 'overdue', portalUrl: appUrl() }), key)
}

/** To the owner (Settings -> contact email) the moment someone submits the public booking form. */
export async function notifyNewBooking(booking: { id: string; residentName: string; phone: string; email: string | null; moveInDate: Date | null; foodOpted: boolean | null; message: string; source: string; property: { name: string } }) {
  const settings = await getSettings()
  if (!isEmailEnabled() || !isEmailAddress(settings.contactEmail)) return
  const to = settings.contactEmail
  const message = bookingAlertEmail({
    business: settings.businessName,
    name: booking.residentName,
    phone: booking.phone,
    email: booking.email,
    property: booking.property.name,
    source: booking.source === 'direct' ? 'direct' : booking.source.charAt(0).toUpperCase() + booking.source.slice(1),
    moveIn: booking.moveInDate ? booking.moveInDate.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : null,
    food: booking.foodOpted === null ? null : booking.foodOpted ? 'With food' : 'Without food',
    message: booking.message,
    adminUrl: appUrl(),
  })
  await deliver('email', null, to, 'booking_alert', `booking:${booking.id}`, () => sendEmail({ to, ...message }))
}
