import { AadharVerificationStatus } from '@prisma/client'
import { prisma } from './db.js'
import { createMaintenanceRequest, isMaintenanceCategory } from './maintenance.js'
import { displayName } from './names.js'
import { appUrl } from './notifications.js'
import { nextRentDue, rentStatus, activeConcessions } from './rent.js'
import { activeResidentIdsByPhone } from './residentCredentials.js'
import { residentInfoOf } from './residentInfo.js'
import { isResidentFeatureOn } from './residentFeatures.js'
import { findRentLockMessage } from './rentLock.js'
import { getSettings, rentRulesOf } from './settings.js'
import { normalizePhone } from './validation.js'
import type { BotStore, ChatStep, Sender } from './whatsappBot.js'

// A half-finished repair report is forgotten after this long, so a stray message days later is not filed.
const stepLifetimeMs = 30 * 60 * 1000

const propertyInfoSelect = { name: true, location: true, city: true, wifiName: true, wifiPassword: true, contacts: true, websiteUrl: true, checkInTime: true, checkOutTime: true, gateClosingTime: true } as const

/**
 * Identifies the sender with the same bar as the portal (requirePortalAccess): an active resident
 * with a room, approved, with verified ID. The sender's number is proven by WhatsApp itself.
 */
async function findSender(phone: string): Promise<Sender> {
  const settings = await getSettings()
  const fallback = { businessName: settings.businessName, receptionPhone: settings.contactPhone }
  const e164 = normalizePhone(`+${phone}`)
  const ids = e164 ? await activeResidentIdsByPhone(e164) : []
  if (ids.length > 1) return { kind: 'shared', ...fallback }
  const resident = ids.length ? await prisma.resident.findUnique({ where: { id: ids[0] }, select: { id: true, name: true, approvalPending: true, aadharStatus: true, room: { select: { property: { select: { ownerPhone: true } } } } } }) : null
  if (!resident?.room) return { kind: 'unknown', ...fallback }
  if (resident.approvalPending || resident.aadharStatus !== AadharVerificationStatus.VERIFIED) return { kind: 'pending', ...fallback, receptionPhone: resident.room.property.ownerPhone ?? settings.contactPhone }
  return {
    kind: 'resident',
    resident: {
      id: resident.id,
      firstName: displayName(resident.name).split(' ')[0],
      businessName: settings.businessName,
      receptionPhone: resident.room.property.ownerPhone ?? settings.contactPhone,
      portalUrl: appUrl(),
      lockMessage: await findRentLockMessage(resident.id),
      features: { faqs: isResidentFeatureOn(settings.residentFeatures, 'faqs'), repairs: isResidentFeatureOn(settings.residentFeatures, 'repairs'), wifi: isResidentFeatureOn(settings.residentFeatures, 'wifi'), payments: isResidentFeatureOn(settings.residentFeatures, 'payments') },
    },
  }
}

/** The bot's data, read and written through Prisma. */
export const prismaBotStore: BotStore = {
  findSender,

  async rentOf(residentId) {
    const [resident, settings] = await Promise.all([
      prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentPayments: { select: { month: true } }, ...activeConcessions } }),
      getSettings(),
    ])
    const paidMonths = resident.rentPayments.map((payment) => payment.month)
    const status = rentStatus(resident, paidMonths, rentRulesOf(settings))
    return { status, next: nextRentDue(status, paidMonths) }
  },

  async infoOf(residentId) {
    const [resident, settings] = await Promise.all([
      prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { room: { select: { property: { select: propertyInfoSelect } } } } }),
      getSettings(),
    ])
    const { wifi, faqs } = residentInfoOf(resident.room?.property, settings)
    return { wifi, faqs }
  },

  async createRepair(residentId, category, title, details) {
    return Boolean(await createMaintenanceRequest(residentId, { title, category, details }))
  },

  async loadStep(phone) {
    const chat = await prisma.whatsAppChat.findUnique({ where: { phone } })
    if (!chat?.stepAt || chat.step !== 'repair' || !isMaintenanceCategory(chat.repairCategory) || Date.now() - chat.stepAt.getTime() > stepLifetimeMs) return null
    return { step: 'repair', category: chat.repairCategory }
  },

  async saveStep(phone, step: ChatStep) {
    const data = { step: step?.step ?? null, repairCategory: step?.category ?? null, stepAt: step ? new Date() : null }
    await prisma.whatsAppChat.upsert({ where: { phone }, create: { phone, ...data }, update: data })
  },
}

/**
 * Records `messageId` as the chat's latest and says whether it is new. Meta re-delivers a webhook it
 * thinks failed, and answering twice would file a repair twice.
 */
export async function claimMessage(phone: string, messageId: string) {
  const chat = await prisma.whatsAppChat.findUnique({ where: { phone }, select: { lastMessageId: true } })
  if (chat?.lastMessageId === messageId) return false
  await prisma.whatsAppChat.upsert({ where: { phone }, create: { phone, lastMessageId: messageId }, update: { lastMessageId: messageId } })
  return true
}
