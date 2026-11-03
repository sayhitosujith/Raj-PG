import { createHash } from 'node:crypto'
import { HousekeepingStatus, type HousekeepingSlot } from '@prisma/client'
import { formatMonthLabel } from './dates.js'
import { prisma } from './db.js'
import { isEmailAddress, isEmailEnabled, sendEmail } from './emailClient.js'
import { announcementEmail, bookingAlertEmail, paymentReceivedEmail, rentReminderEmail, residentWelcomeEmail, fireAlertEmail, fireReportedEmail, exitRequestedEmail, exitDecisionEmail, exitDateChangedEmail, exitCancelledEmail, maintenanceRaisedEmail, maintenanceUpdatedEmail } from './emailTemplates.js'
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
export const templates = { rentReminder: 'rent_reminder', rentOverdue: 'rent_overdue', paymentReceived: 'payment_received', announcement: 'announcement', housekeeping: 'housekeeping_update', residentWelcome: 'resident_welcome', fireAlert: 'fire_alert', registrationLink: 'resident_registration' } as const

type Channel = 'whatsapp' | 'email'
/** What happened to one message: skipped when the channel is off or the resident has no address for it. */
type DeliveryResult = 'sent' | 'failed' | 'skipped'
type Recipient = { id: string; name: string; phone: string | null; email: string | null; whatsappOptIn: boolean; emailOptIn: boolean }
export const recipientSelect = { id: true, name: true, phone: true, email: true, whatsappOptIn: true, emailOptIn: true } as const

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`
/** Where links in emails point; the web app's public address. */
const appUrl = () => (process.env.APP_URL || 'https://raj-pg.netlify.app').replace(/\/$/, '')

/**
 * Sends one message unless it was already sent under `dedupeKey`, and logs the outcome. WhatsApp
 * keys stay unprefixed (as they were before email existed); email keys start "email:".
 */
async function deliver(channel: Channel, residentId: string | null, to: string, kind: string, key: string, send: () => Promise<string | null>): Promise<DeliveryResult> {
  const dedupeKey = channel === 'email' ? `email:${key}` : key
  const existing = await prisma.outboundMessage.findUnique({ where: { dedupeKey } })
  if (existing && existing.status !== 'failed') return 'sent'
  const log = existing
    ? await prisma.outboundMessage.update({ where: { id: existing.id }, data: { status: 'pending', error: null, to } })
    : await prisma.outboundMessage.create({ data: { channel, residentId, to, kind, dedupeKey } })
  try {
    await prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'sent', providerMessageId: await send() } })
    return 'sent'
  } catch (error) {
    await prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' } })
    return 'failed'
  }
}

function toWhatsApp(resident: Recipient, template: string, params: string[], key: string, attachment?: () => Promise<{ id: string; filename: string }>): Promise<DeliveryResult> {
  if (!isWhatsAppEnabled() || !resident.whatsappOptIn || !resident.phone) return Promise.resolve('skipped')
  const to = whatsappNumber(resident.phone)
  if (!to) return Promise.resolve('skipped')
  return deliver('whatsapp', resident.id, to, template, key, async () => sendTemplate(to, template, params, attachment ? await attachment() : undefined))
}

function toEmail(resident: Recipient, kind: string, message: { subject: string; html: string; text: string }, key: string, options: { ignoreOptOut?: boolean; attachments?: () => Promise<Array<{ filename: string; content: Buffer }>> } = {}): Promise<DeliveryResult> {
  if (!isEmailEnabled() || !isEmailAddress(resident.email) || (!resident.emailOptIn && !options.ignoreOptOut)) return Promise.resolve('skipped')
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
    await toWhatsApp(resident, templates.paymentReceived, [name, businessName, rupees(payment.amount), month, resident.room?.property.name ?? ''], `payment:${payment.id}`, async () => {
      const { filename, content } = await receiptPdf()
      return { id: await uploadPdf(content, filename), filename }
    })
    await toEmail(resident, 'payment_received', paymentReceivedEmail({ business: businessName, name, amount: rupees(payment.amount), month, property: resident.room?.property.name ?? '' }), `payment:${payment.id}`, { ignoreOptOut: true, attachments: async () => [await receiptPdf()] })
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
    await toEmail(resident, 'announcement', announcementEmail({ business: businessName, name, title: announcement.title, message: announcement.message, property: resident.room?.property.name ?? '' }), `announcement:${announcement.id}:${resident.id}`)
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

/**
 * A self-registration link (selfRegistration.ts) to a resident staff have reserved a bed for. WhatsApp only, and
 * sent even before they opt in to updates, since it is how they join. The template "resident_registration" must be
 * approved in Meta with four variables: {{1}} name, {{2}} business, {{3}} property and room, {{4}} link.
 */
export async function notifyRegistrationLink(residentId: string, link: string, sentAt: Date): Promise<DeliveryResult> {
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { ...recipientSelect, bedNumber: true, room: { select: { number: true, property: { select: { name: true } } } } } })
  if (!resident) return 'skipped'
  const { businessName } = await getSettings()
  const place = resident.room ? `${resident.room.property.name}, room ${resident.room.number}${resident.bedNumber ? ` bed ${resident.bedNumber}` : ''}` : ''
  // Unique per link, so "Resend link" always sends again while a retry of the same link does not.
  return toWhatsApp({ ...resident, whatsappOptIn: true }, templates.registrationLink, [displayName(resident.name), businessName, place, link], `registration:${resident.id}:${sentAt.getTime()}`)
}

/**
 * A new resident's sign-in details: "Welcome to <property>", their login (email, or phone when they
 * have none) and the temporary access key. Sent when the owner asks (on add, or after issuing a new
 * key); the key is only known at that moment because it is stored hashed. Email goes even if they
 * opted out of email updates, like receipts, since it is how they get in. The WhatsApp template
 * "resident_welcome" must be approved in Meta with five variables:
 *   {{1}} name, {{2}} property, {{3}} login, {{4}} access key, {{5}} portal link.
 * Returns what happened on each channel, so the owner knows whether to share the key themselves.
 */
export async function notifyResidentCredentials(residentId: string, accessKey: string) {
  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { ...recipientSelect, room: { select: { property: { select: { name: true } } } } } })
  if (!resident) return { email: 'skipped', whatsapp: 'skipped' } satisfies Record<Channel, DeliveryResult>
  const { businessName } = await getSettings()
  const name = displayName(resident.name)
  const property = resident.room?.property.name ?? ''
  const login = resident.email || resident.phone || ''
  // Unique per key, so issuing a new key always sends again while a retry of the same key does not.
  const key = `credentials:${resident.id}:${createHash('sha256').update(accessKey).digest('hex').slice(0, 16)}`
  const [email, whatsapp] = await Promise.all([
    toEmail(resident, 'resident_welcome', residentWelcomeEmail({ business: businessName, name, property, login, accessKey, portalUrl: appUrl() }), key, { ignoreOptOut: true }),
    toWhatsApp(resident, templates.residentWelcome, [name, property, login, accessKey, appUrl()], key),
  ])
  return { email, whatsapp }
}

/**
 * A fire alarm: every active resident of the property by email (even if they opted out of email
 * updates) and WhatsApp (template "fire_alert": {{1}} name, {{2}} property, {{3}} raised by), plus
 * every super admin by email when a resident raised it. Residents locked out of the portal for rent
 * or awaiting ID approval still get these, since they cannot see the portal alarm.
 */
export async function notifyFireAlert(alert: { id: string; propertyId: string; raisedByName: string; raisedByResidentId: string | null }) {
  const [{ businessName }, property, residents] = await Promise.all([
    getSettings(),
    prisma.property.findUniqueOrThrow({ where: { id: alert.propertyId }, select: { name: true } }),
    prisma.resident.findMany({ where: { active: true, room: { propertyId: alert.propertyId } }, select: recipientSelect }),
  ])
  await Promise.all(residents.map(async (resident) => {
    const name = displayName(resident.name)
    const key = `fire:${alert.id}:${resident.id}`
    await toEmail(resident, 'fire_alert', fireAlertEmail({ business: businessName, name, property: property.name, raisedBy: alert.raisedByName, portalUrl: appUrl() }), key, { ignoreOptOut: true })
    await toWhatsApp(resident, templates.fireAlert, [name, property.name, alert.raisedByName], key)
  }))
  if (!alert.raisedByResidentId || !isEmailEnabled()) return
  const message = fireReportedEmail({ business: businessName, property: property.name, raisedBy: alert.raisedByName, adminUrl: appUrl() })
  for (const to of await bookingAlertRecipients()) await deliver('email', null, to, 'fire_reported', `fire-admin:${alert.id}:${to.toLowerCase()}`, () => sendEmail({ to, ...message }))
}

const longDate = (date: Date) => date.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

/** Emails every super admin (and the contact email) about a resident's new move-out notice. */
export async function notifyExitRequested(residentId: string) {
  if (!isEmailEnabled()) return
  const [{ businessName }, resident, recipients] = await Promise.all([getSettings(), prisma.resident.findUnique({ where: { id: residentId }, select: { name: true, exitDate: true, exitReason: true, exitRequestedAt: true, room: { select: { number: true, property: { select: { name: true } } } } } }), bookingAlertRecipients()])
  if (!resident?.exitDate || !resident.exitRequestedAt) return
  const message = exitRequestedEmail({ business: businessName, name: resident.name, property: resident.room?.property.name ?? '', room: resident.room?.number ?? '—', date: longDate(resident.exitDate), reason: resident.exitReason, adminUrl: appUrl() })
  for (const to of recipients) await deliver('email', null, to, 'exit_requested', `exit:${residentId}:${resident.exitRequestedAt.getTime()}:${to.toLowerCase()}`, () => sendEmail({ to, ...message }))
}

/** Tells the resident their move-out notice was approved or declined (email, even if updates are off). */
export async function notifyExitDecision(residentId: string, approved: boolean) {
  const [{ businessName }, resident] = await Promise.all([getSettings(), prisma.resident.findUnique({ where: { id: residentId }, select: { ...recipientSelect, exitDate: true, exitRequestedAt: true, room: { select: { property: { select: { name: true } } } } } })])
  if (!resident?.exitDate || !resident.exitRequestedAt) return
  const message = exitDecisionEmail({ business: businessName, name: displayName(resident.name), property: resident.room?.property.name ?? '', date: longDate(resident.exitDate), approved, portalUrl: appUrl() })
  await toEmail(resident, 'exit_decision', message, `exit-decision:${residentId}:${resident.exitRequestedAt.getTime()}`, { ignoreOptOut: true })
}

/** Tells the resident the owner moved their move-out date (email, even if updates are off). */
export async function notifyExitDateChanged(residentId: string) {
  const [{ businessName }, resident] = await Promise.all([getSettings(), prisma.resident.findUnique({ where: { id: residentId }, select: { ...recipientSelect, exitDate: true, room: { select: { property: { select: { name: true } } } } } })])
  if (!resident?.exitDate) return
  const message = exitDateChangedEmail({ business: businessName, name: displayName(resident.name), property: resident.room?.property.name ?? '', date: longDate(resident.exitDate), portalUrl: appUrl() })
  await toEmail(resident, 'exit_date_changed', message, `exit-date:${residentId}:${resident.exitDate.getTime()}`, { ignoreOptOut: true })
}

/** Emails every super admin (and the contact email) when a resident cancels an approved move-out. */
export async function notifyExitCancelled(residentId: string, cancelledDate: Date) {
  if (!isEmailEnabled()) return
  const [{ businessName }, resident, recipients] = await Promise.all([getSettings(), prisma.resident.findUnique({ where: { id: residentId }, select: { name: true, room: { select: { number: true, property: { select: { name: true } } } } } }), bookingAlertRecipients()])
  if (!resident) return
  const message = exitCancelledEmail({ business: businessName, name: resident.name, property: resident.room?.property.name ?? '', room: resident.room?.number ?? '—', date: longDate(cancelledDate), adminUrl: appUrl() })
  for (const to of recipients) await deliver('email', null, to, 'exit_cancelled', `exit-cancel:${residentId}:${Date.now()}:${to.toLowerCase()}`, () => sendEmail({ to, ...message }))
}

const statusWords: Record<string, string> = { open: 'open', in_progress: 'in progress', resolved: 'resolved' }

/** Emails every super admin (and the contact email) about a resident's new maintenance request. */
export async function notifyMaintenanceRaised(requestId: string) {
  if (!isEmailEnabled()) return
  const [{ businessName }, request, recipients] = await Promise.all([getSettings(), prisma.maintenanceRequest.findUnique({ where: { id: requestId }, select: { title: true, category: true, details: true, property: { select: { name: true } }, resident: { select: { name: true, room: { select: { number: true } } } } } }), bookingAlertRecipients()])
  if (!request) return
  const message = maintenanceRaisedEmail({ business: businessName, name: request.resident?.name ?? 'A resident', property: request.property.name, room: request.resident?.room?.number ?? '—', title: request.title, category: request.category, details: request.details, adminUrl: appUrl() })
  for (const to of recipients) await deliver('email', null, to, 'maintenance_raised', `maintenance:${requestId}:${to.toLowerCase()}`, () => sendEmail({ to, ...message }))
}

/** Tells the resident their request changed status or got a reply (email, honouring their preference). */
export async function notifyMaintenanceUpdated(requestId: string) {
  const [{ businessName }, request] = await Promise.all([getSettings(), prisma.maintenanceRequest.findUnique({ where: { id: requestId }, select: { title: true, status: true, ownerNote: true, updatedAt: true, resident: { select: recipientSelect } } })])
  if (!request?.resident) return
  const message = maintenanceUpdatedEmail({ business: businessName, name: displayName(request.resident.name), title: request.title, status: statusWords[request.status] ?? request.status, note: request.ownerNote, portalUrl: appUrl() })
  await toEmail(request.resident, 'maintenance_updated', message, `maintenance-update:${requestId}:${request.updatedAt.getTime()}`)
}

/** A rent reminder or overdue notice; the key makes it once per resident, month, stage and channel. */
export async function notifyRent(resident: Recipient, stage: 'reminder1' | 'reminder2' | 'reminder3' | 'overdue', details: { amount: number; months: string[]; dueDate: string; lockDate: string; property: string }) {
  const { businessName } = await getSettings()
  const name = displayName(resident.name)
  const monthLabel = details.months.map(formatMonthLabel).join(', ')
  const key = `rent:${resident.id}:${details.months[0]}:${stage}`
  await toWhatsApp(resident, stage === 'overdue' ? templates.rentOverdue : templates.rentReminder, [name, businessName, rupees(details.amount), monthLabel, details.property, details.dueDate], key)
  await toEmail(resident, stage === 'overdue' ? 'rent_overdue' : 'rent_reminder', rentReminderEmail({ business: businessName, name, amount: rupees(details.amount), months: monthLabel, property: details.property, dueDate: details.dueDate, overdue: stage === 'overdue', lockWarning: stage === 'reminder3' ? `12:00 am on ${details.lockDate}` : null, portalUrl: appUrl() }), key)
}

/**
 * Who hears about a new booking request: every super admin, plus the contact email in Settings if
 * it is not already one of them. Addresses are compared case-insensitively so nobody gets two.
 */
export async function bookingAlertRecipients() {
  const [settings, admins] = await Promise.all([getSettings(), prisma.superAdmin.findMany({ select: { email: true }, orderBy: { createdAt: 'asc' } })])
  const addresses = [...admins.map((admin) => admin.email), settings.contactEmail].filter(isEmailAddress)
  return [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()]
}

/** To every super admin (and the contact email) the moment someone submits the public booking form. */
export async function notifyNewBooking(booking: { id: string; residentName: string; phone: string; email: string | null; moveInDate: Date | null; foodOpted: boolean | null; message: string; source: string; property: { name: string } }) {
  if (!isEmailEnabled()) return
  const [settings, recipients] = await Promise.all([getSettings(), bookingAlertRecipients()])
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
  // One key per address, so a retry resends only to whoever it failed for.
  for (const to of recipients) await deliver('email', null, to, 'booking_alert', `booking:${booking.id}:${to.toLowerCase()}`, () => sendEmail({ to, ...message }))
}
