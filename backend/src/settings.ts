import type { HousekeepingSlot, WorkspaceSettings } from '@prisma/client'
import { Router } from 'express'
import { prisma } from './db.js'
import { defaultPrivacyPolicy, defaultTerms } from './defaultPolicies.js'
import { findLogoProblem, photoVersion, sendLogo } from './photo.js'
import { isValidEmail } from './validation.js'

const settingsId = 'workspace'
// Settings change rarely but are read on every rent/housekeeping calculation, so they are cached
// in memory and dropped whenever the owner saves. A single API process makes this safe.
let cached: WorkspaceSettings | null = null

/** The workspace settings row, created with defaults the first time it is needed. */
export async function getSettings() {
  cached ??= await prisma.workspaceSettings.upsert({ where: { id: settingsId }, create: { id: settingsId }, update: {} })
  return cached
}

/** Rent cycle days, e.g. { dueDay: 2, reminderOneDay: 1, reminderTwoDay: 2 }. */
export type RentRules = { dueDay: number; reminderOneDay: number; reminderTwoDay: number }
export const rentRulesOf = (settings: WorkspaceSettings): RentRules => ({ dueDay: settings.rentDueDay, reminderOneDay: settings.rentReminderOneDay, reminderTwoDay: settings.rentReminderTwoDay })

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

/** A slot's window in minutes after local midnight, plus labels for display. */
export function slotDetails(settings: WorkspaceSettings, slot: HousekeepingSlot) {
  const { key, label } = slotNames[slot]
  const from = settings[`${key}From`]
  const to = settings[`${key}To`]
  const hours = `${formatClock(from)} – ${formatClock(to)}`
  return { value: slot, label, hours, fullLabel: `${label} (${hours})`, startMinutes: toMinutes(from), endMinutes: toMinutes(to) }
}

/** All three slots for forms (value, label, hours). */
export const slotOptionsOf = (settings: WorkspaceSettings) => (Object.keys(slotNames) as HousekeepingSlot[]).map((slot) => { const { value, label, hours } = slotDetails(settings, slot); return { value, label, hours } })

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

type SettingsInput = { termsAndConditions?: unknown; privacyPolicy?: unknown; businessName?: unknown; contactPhone?: unknown; contactEmail?: unknown; rentDueDay?: unknown; rentReminderOneDay?: unknown; rentReminderTwoDay?: unknown } & Partial<Record<`${'morning' | 'afternoon' | 'evening'}${'From' | 'To'}`, unknown>>

const policyMaxLength = 5000
const policyFields = { termsAndConditions: 'Terms and conditions', privacyPolicy: 'Privacy policy' } as const

const isDay = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 28

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
  for (const [field, label] of Object.entries(policyFields) as [keyof typeof policyFields, string][]) {
    const text = input[field]
    if (text === undefined) continue
    if (typeof text !== 'string') return { error: `${label} must be text.` }
    if (text.trim().length > policyMaxLength) return { error: `${label} can be up to ${policyMaxLength} characters.` }
    data[field] = text.trim()
  }
  const rentFields = ['rentDueDay', 'rentReminderOneDay', 'rentReminderTwoDay'] as const
  if (rentFields.some((field) => input[field] !== undefined)) {
    const due = input.rentDueDay ?? current.rentDueDay
    const one = input.rentReminderOneDay ?? current.rentReminderOneDay
    const two = input.rentReminderTwoDay ?? current.rentReminderTwoDay
    if (!isDay(due) || !isDay(one) || !isDay(two)) return { error: 'Rent days must be whole days from 1 to 28.' }
    if (!(one < two && two <= due)) return { error: 'Reminder 1 must come before reminder 2, and reminder 2 cannot be after the due day.' }
    Object.assign(data, { rentDueDay: due, rentReminderOneDay: one, rentReminderTwoDay: two })
  }
  for (const key of ['morning', 'afternoon', 'evening'] as const) {
    const from = input[`${key}From`]
    const to = input[`${key}To`]
    if (from === undefined && to === undefined) continue
    const start = from ?? current[`${key}From`]
    const end = to ?? current[`${key}To`]
    const label = key[0].toUpperCase() + key.slice(1)
    if (typeof start !== 'string' || typeof end !== 'string' || !timePattern.test(start) || !timePattern.test(end)) return { error: `${label} needs a start and end time.` }
    if (start >= end) return { error: `${label} must start before it ends.` }
    data[`${key}From`] = start
    data[`${key}To`] = end
  }
  return { data }
}

/** The policies residents see: the owner's saved text, or the starter draft if they never saved any. */
export const policiesOf = (settings: WorkspaceSettings) => ({ termsAndConditions: settings.termsAndConditions ?? defaultTerms, privacyPolicy: settings.privacyPolicy ?? defaultPrivacyPolicy })

/** Settings as sent to browsers: the logo is served separately, referenced by version. */
export function toClientSettings(settings: WorkspaceSettings) {
  const { logoUrl: _logoUrl, logoUpdatedAt, ...fields } = settings
  return { ...fields, ...policiesOf(settings), logoVersion: photoVersion(logoUpdatedAt) }
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

settingsRouter.put('/settings/logo', async (request, response) => {
  const { logo } = request.body as { logo?: unknown }
  const problem = findLogoProblem(logo)
  if (problem) { response.status(400).json({ error: problem }); return }
  try {
    await getSettings()
    cached = await prisma.workspaceSettings.update({ where: { id: settingsId }, data: { logoUrl: logo as string, logoUpdatedAt: new Date() } })
    response.json(toClientSettings(cached))
  } catch (error) {
    cached = null
    console.error('Logo upload failed:', error)
    response.status(503).json({ error: 'The logo could not be saved.' })
  }
})

settingsRouter.delete('/settings/logo', async (_request, response) => {
  try {
    await getSettings()
    cached = await prisma.workspaceSettings.update({ where: { id: settingsId }, data: { logoUrl: null, logoUpdatedAt: null } })
    response.json(toClientSettings(cached))
  } catch (error) {
    cached = null
    console.error('Logo removal failed:', error)
    response.status(503).json({ error: 'The logo could not be removed.' })
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
