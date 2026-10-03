import type { HousekeepingSlot, WorkspaceSettings } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from './db.js'
import { findLogoProblem, findUpiQrProblem, photoVersion, sendLogo, sendUpiQr } from './photo.js'
import { policiesOf, policyFields, policyMaxLength, policyVersionChanges, type PolicyField } from './policies.js'
import { isValidEmail, isValidUpiId } from './validation.js'

const settingsId = 'workspace'
// Settings change rarely but are read on every rent/housekeeping calculation, so they are cached
// in memory and dropped whenever the owner saves. A single API process makes this safe.
let cached: WorkspaceSettings | null = null

/** The workspace settings row, created with defaults the first time it is needed. */
export async function getSettings() {
  cached ??= await prisma.workspaceSettings.upsert({ where: { id: settingsId }, create: { id: settingsId }, update: {} })
  return cached
}

/** Rent cycle days plus the late fee, e.g. { dueDay: 3, reminderOneDay: 1, reminderTwoDay: 2, reminderThreeDay: 3, lateFee: 200 }. */
export type RentRules = { dueDay: number; reminderOneDay: number; reminderTwoDay: number; reminderThreeDay: number; lateFee: number }
export const rentRulesOf = (settings: WorkspaceSettings): RentRules => ({ dueDay: settings.rentDueDay, reminderOneDay: settings.rentReminderOneDay, reminderTwoDay: settings.rentReminderTwoDay, reminderThreeDay: settings.rentReminderThreeDay, lateFee: settings.lateFee })

const slotNames: Record<HousekeepingSlot, { key: 'morning' | 'afternoon' | 'evening'; label: string }> = {
  MORNING: { key: 'morning', label: 'Morning' },
  AFTERNOON: { key: 'afternoon', label: 'Afternoon' },
  EVENING: { key: 'evening', label: 'Evening' },
}
const toMinutes = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }
function formatClock(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}${hours < 12 ? 'am' : 'pm'}`
}

/** "10am – 8pm" from two "HH:MM" times. */
const formatHours = (from: string, to: string) => `${formatClock(from)} – ${formatClock(to)}`

/** A slot's window in minutes after local midnight, plus labels for display. */
export function slotDetails(settings: WorkspaceSettings, slot: HousekeepingSlot) {
  const { key, label } = slotNames[slot]
  const from = settings[`${key}From`]
  const to = settings[`${key}To`]
  const hours = formatHours(from, to)
  return { value: slot, label, hours, fullLabel: `${label} (${hours})`, startMinutes: toMinutes(from), endMinutes: toMinutes(to) }
}

/** House rules shown in the resident portal. */
export const houseRulesOf = (settings: WorkspaceSettings) => ({ visitingHours: formatHours(settings.visitingFrom, settings.visitingTo), quietHours: formatHours(settings.quietFrom, settings.quietTo), noticePeriodDays: settings.noticePeriodDays, securityDeposit: settings.securityDeposit })

/** All three slots for forms (value, label, hours). */
export const slotOptionsOf = (settings: WorkspaceSettings) => (Object.keys(slotNames) as HousekeepingSlot[]).map((slot) => { const { value, label, hours } = slotDetails(settings, slot); return { value, label, hours } })

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

// Each window is a start/end pair of "HH:MM" fields; overnight windows may end the next morning.
const timeWindows = [
  { key: 'morning', label: 'Morning', overnight: false },
  { key: 'afternoon', label: 'Afternoon', overnight: false },
  { key: 'evening', label: 'Evening', overnight: false },
  { key: 'visiting', label: 'Visiting hours', overnight: false },
  { key: 'quiet', label: 'Quiet hours', overnight: true },
] as const
type WindowField = `${(typeof timeWindows)[number]['key']}${'From' | 'To'}`

type SettingsInput = { upiId?: unknown; upiPayeeName?: unknown; termsAndConditions?: unknown; privacyPolicy?: unknown; businessName?: unknown; contactPhone?: unknown; contactEmail?: unknown; rentDueDay?: unknown; rentReminderOneDay?: unknown; rentReminderTwoDay?: unknown; rentReminderThreeDay?: unknown; lateFee?: unknown; securityDeposit?: unknown; noticePeriodDays?: unknown; dailyRateWithFood?: unknown; dailyRateWithoutFood?: unknown; housekeepingWeeklyLimit?: unknown } & Partial<Record<WindowField, unknown>>


const isWholeNumber = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const isDay = (value: unknown): value is number => isWholeNumber(value, 1, 28)

// Whole-number settings: [field, min, max, nullable, error]. A nullable field is cleared with null.
const numberFields = [
  ['lateFee', 0, 1_00_000, false, 'Late fee must be a whole number of rupees (0 for none).'],
  ['securityDeposit', 1, 10_00_000, true, 'Security deposit must be a whole number of rupees, or blank.'],
  ['noticePeriodDays', 0, 180, false, 'Notice period must be 0 to 180 days.'],
  ['dailyRateWithFood', 1, 1_00_000, false, 'Per-day rate with food must be a whole number of rupees.'],
  ['dailyRateWithoutFood', 1, 1_00_000, false, 'Per-day rate without food must be a whole number of rupees.'],
  ['housekeepingWeeklyLimit', 1, 21, true, 'Weekly cleanings must be 1 to 21, or blank for no limit.'],
] as const

/**
 * Validates a partial settings update (each Settings section saves on its own). Rent days must
 * run reminder 1 < reminder 2 <= due day <= 28 so every month has all three days.
 */
function parseSettings(input: SettingsInput, current: WorkspaceSettings): { data: Partial<WorkspaceSettings> } | { error: string } {
  const data: Partial<WorkspaceSettings> = {}
  if (input.businessName !== undefined) {
    if (typeof input.businessName !== 'string' || !input.businessName.trim() || input.businessName.trim().length > 60) return { error: 'Business name is required (up to 60 characters).' }
    data.businessName = input.businessName.trim()
  }
  if (input.contactPhone !== undefined) {
    if (input.contactPhone !== null && typeof input.contactPhone !== 'string') return { error: 'Contact phone must be text.' }
    data.contactPhone = input.contactPhone?.trim() || null
  }
  if (input.contactEmail !== undefined) {
    if (input.contactEmail !== null && typeof input.contactEmail !== 'string') return { error: 'Contact email must be text.' }
    const email = input.contactEmail?.trim() || null
    if (email && !isValidEmail(email)) return { error: 'Enter a valid contact email.' }
    data.contactEmail = email
  }
  if (input.upiId !== undefined) {
    if (input.upiId !== null && typeof input.upiId !== 'string') return { error: 'UPI ID must be text.' }
    const upiId = input.upiId?.trim() || null
    if (upiId && !isValidUpiId(upiId)) return { error: 'Enter a valid UPI ID, e.g. rajpg@okhdfcbank.' }
    data.upiId = upiId
  }
  if (input.upiPayeeName !== undefined) {
    if (input.upiPayeeName !== null && typeof input.upiPayeeName !== 'string') return { error: 'Payee name must be text.' }
    const payeeName = input.upiPayeeName?.trim() || null
    if (payeeName && payeeName.length > 50) return { error: 'Payee name can be up to 50 characters.' }
    data.upiPayeeName = payeeName
  }
  for (const [field, { label }] of Object.entries(policyFields) as [PolicyField, (typeof policyFields)[PolicyField]][]) {
    const text = input[field]
    if (text === undefined) continue
    if (typeof text !== 'string') return { error: `${label} must be text.` }
    if (text.trim().length > policyMaxLength) return { error: `${label} can be up to ${policyMaxLength} characters.` }
    data[field] = text.trim()
  }
  Object.assign(data, policyVersionChanges(data as Partial<Record<PolicyField, string>>, current))
  const rentFields = ['rentDueDay', 'rentReminderOneDay', 'rentReminderTwoDay', 'rentReminderThreeDay'] as const
  if (rentFields.some((field) => input[field] !== undefined)) {
    const due = input.rentDueDay ?? current.rentDueDay
    const one = input.rentReminderOneDay ?? current.rentReminderOneDay
    const two = input.rentReminderTwoDay ?? current.rentReminderTwoDay
    const three = input.rentReminderThreeDay ?? current.rentReminderThreeDay
    if (!isDay(due) || !isDay(one) || !isDay(two) || !isDay(three)) return { error: 'Rent days must be whole days from 1 to 28.' }
    if (!(one < two && two < three && three <= due)) return { error: 'Reminders must be on different days in order (1, then 2, then 3), and reminder 3 cannot be after the due day.' }
    Object.assign(data, { rentDueDay: due, rentReminderOneDay: one, rentReminderTwoDay: two, rentReminderThreeDay: three })
  }
  for (const [field, min, max, nullable, error] of numberFields) {
    const raw = input[field]
    if (raw === undefined) continue
    if (nullable && raw === null) { data[field] = null; continue }
    if (!isWholeNumber(raw, min, max)) return { error }
    data[field] = raw
  }
  for (const { key, label, overnight } of timeWindows) {
    const from = input[`${key}From`]
    const to = input[`${key}To`]
    if (from === undefined && to === undefined) continue
    const start = from ?? current[`${key}From`]
    const end = to ?? current[`${key}To`]
    if (typeof start !== 'string' || typeof end !== 'string' || !timePattern.test(start) || !timePattern.test(end)) return { error: `${label} needs a start and end time.` }
    if (overnight ? start === end : start >= end) return { error: overnight ? `${label} must start and end at different times.` : `${label} must start before it ends.` }
    data[`${key}From`] = start
    data[`${key}To`] = end
  }
  return { data }
}

/** Settings as sent to browsers: the logo and UPI QR image are served separately, referenced by version. */
export function toClientSettings(settings: WorkspaceSettings) {
  const { logoUrl: _logoUrl, logoUpdatedAt, upiQrUrl: _upiQrUrl, upiQrUpdatedAt, ...fields } = settings
  return { ...fields, ...policiesOf(settings), logoVersion: photoVersion(logoUpdatedAt), upiQrVersion: photoVersion(upiQrUpdatedAt) }
}

/** Owner routes for the Settings page; must be mounted behind the super admin guard. */
export const settingsRouter = Router()

settingsRouter.get('/settings', async (_request, response) => {
  try {
    response.json(toClientSettings(await getSettings()))
  } catch (error) {
    console.error('Settings load failed:', error)
    response.status(503).json({ error: 'Settings could not be loaded.' })
  }
})

settingsRouter.put('/settings', async (request, response) => {
  try {
    const parsed = parseSettings(request.body as SettingsInput, await getSettings())
    if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
    const { id: _id, updatedAt: _updatedAt, ...changes } = parsed.data
    cached = await prisma.workspaceSettings.update({ where: { id: settingsId }, data: changes })
    response.json(toClientSettings(cached))
  } catch (error) {
    cached = null
    console.error('Settings update failed:', error)
    response.status(503).json({ error: 'Settings could not be saved.' })
  }
})

/**
 * PUT (upload, body `{ image }`) and DELETE (remove) for an image kept on the settings row as a
 * data URL plus an updated-at that versions its URL. Shared by the logo and the UPI QR image.
 */
function imageSettingRoutes(path: string, fields: { url: 'logoUrl' | 'upiQrUrl'; updatedAt: 'logoUpdatedAt' | 'upiQrUpdatedAt' }, findProblem: (image: unknown) => string | null, noun: string) {
  const save = async (response: Response, image: string | null, failure: string) => {
    try {
      await getSettings()
      cached = await prisma.workspaceSettings.update({ where: { id: settingsId }, data: { [fields.url]: image, [fields.updatedAt]: image ? new Date() : null } })
      response.json(toClientSettings(cached))
    } catch (error) {
      cached = null
      console.error(`${failure}:`, error)
      response.status(503).json({ error: `${failure}.` })
    }
  }
  settingsRouter.put(path, async (request, response) => {
    const { image } = request.body as { image?: unknown }
    const problem = findProblem(image)
    if (problem) { response.status(400).json({ error: problem }); return }
    await save(response, image as string, `The ${noun} could not be saved`)
  })
  settingsRouter.delete(path, async (_request, response) => { await save(response, null, `The ${noun} could not be removed`) })
}

imageSettingRoutes('/settings/logo', { url: 'logoUrl', updatedAt: 'logoUpdatedAt' }, findLogoProblem, 'logo')
imageSettingRoutes('/settings/upi-qr', { url: 'upiQrUrl', updatedAt: 'upiQrUpdatedAt' }, findUpiQrProblem, 'QR image')

// The owner's preview of their QR image in Settings.
settingsRouter.get('/settings/upi-qr', async (_request, response) => {
  try {
    sendUpiQr(response, (await getSettings()).upiQrUrl)
  } catch (error) {
    console.error('UPI QR lookup failed:', error)
    response.status(503).json({ error: 'The QR image could not be loaded.' })
  }
})

/**
 * Public branding for the sign-in page, which shows before anyone is signed in. Only the business
 * name and logo are exposed; everything else in settings stays behind the super admin guard.
 */
export const brandingRouter = Router()

brandingRouter.get('/branding', async (_request, response) => {
  try {
    const settings = await getSettings()
    response.json({ businessName: settings.businessName, logoVersion: photoVersion(settings.logoUpdatedAt) })
  } catch {
    response.json({ businessName: null, logoVersion: null })
  }
})

brandingRouter.get('/branding/logo', async (_request, response) => {
  try {
    sendLogo(response, (await getSettings()).logoUrl)
  } catch (error) {
    console.error('Logo lookup failed:', error)
    response.status(503).json({ error: 'The logo could not be loaded.' })
  }
})
