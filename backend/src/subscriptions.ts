import { Prisma, StaffRole, type StaffSubscription } from '@prisma/client'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma } from './db.js'

/**
 * Receptionist subscriptions: a super admin records each paid period (plan, dates, amount); the
 * period whose last day is latest is the current one. A period's last day is its endsOn, or the day
 * before End now was used on it (endedEarlyOn), whichever is earlier; the recorded dates never change. When it has ended the receptionist is signed out and cannot
 * sign in until a new period is added. Super admins are never restricted, and a receptionist with no
 * periods at all is not either, so accounts from before subscriptions existed keep working.
 */

/** Sent with the 401/403 that turns a receptionist away, so the app can say why. */
export const subscriptionEndedCode = 'SUBSCRIPTION_ENDED'

/** From this many days left (down to 0, the last day) the subscription counts as ending soon: banner and daily notices. */
const endingSoonDays = 7
const maxAmount = 1_00_00_000
const dayMs = 24 * 60 * 60 * 1000

/** Where a receptionist's subscription stands today. daysLeft 0 means today is the last day. */
export type SubscriptionStatus =
  | { state: 'NOT_SET'; endsOn: null; daysLeft: null }
  | { state: 'ACTIVE' | 'ENDING_SOON' | 'ENDED'; endsOn: string; daysLeft: number }

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

// Today at the properties (India), as a UTC-midnight date like the DATE columns hold.
const propertyToday = (now = new Date()) => parseDateOnly(propertyNow(now).date)!

/** The status from the latest end date on record (null when there is none). */
export function subscriptionStatus(latestEndsOn: Date | null | undefined, now = new Date()): SubscriptionStatus {
  if (!latestEndsOn) return { state: 'NOT_SET', endsOn: null, daysLeft: null }
  const daysLeft = Math.round((latestEndsOn.getTime() - propertyToday(now).getTime()) / dayMs)
  const state = daysLeft < 0 ? 'ENDED' : daysLeft <= endingSoonDays ? 'ENDING_SOON' : 'ACTIVE'
  return { state, endsOn: isoDay(latestEndsOn), daysLeft }
}

const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

/** What an ended receptionist is told at sign-in and when their open session is cut off. */
export function subscriptionEndedMessage(endsOn: string) {
  return `Your subscription ended on ${formatDay(endsOn)}. Contact your super admin to renew it.`
}

type PeriodDates = { endsOn: Date; endedEarlyOn: Date | null }

/** The last day a period gives access: endsOn, or the day before it was ended early if that is earlier. */
export function lastDayOf({ endsOn, endedEarlyOn }: PeriodDates) {
  if (!endedEarlyOn) return endsOn
  const dayBefore = new Date(endedEarlyOn.getTime() - dayMs)
  return dayBefore < endsOn ? dayBefore : endsOn
}

// Newest last day first (ties: newest recorded first), so [0] is the current period.
function byLastDay<T extends PeriodDates & { createdAt?: Date }>(rows: T[]) {
  return [...rows].sort((a, b) => lastDayOf(b).getTime() - lastDayOf(a).getTime() || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
}

const statusOf = (rows: PeriodDates[]) => subscriptionStatus(rows.length ? byLastDay(rows).map(lastDayOf)[0] : null)

/** Prisma select for every period's dates, so the access check rides on an existing staff query. */
export const latestSubscriptionSelect = { subscriptions: { select: { endsOn: true, endedEarlyOn: true } } } satisfies Prisma.SuperAdminSelect

/**
 * The message to turn this staff member away with, or null when they may continue. Takes a row read
 * with {@link latestSubscriptionSelect}, so sign-in and the per-request check add no extra query.
 */
export function subscriptionBlock(staff: { staffRole: StaffRole; subscriptions: PeriodDates[] }) {
  if (staff.staffRole !== StaffRole.RECEPTIONIST) return null
  const status = statusOf(staff.subscriptions)
  return status.state === 'ENDED' ? subscriptionEndedMessage(status.endsOn) : null
}

/** A period as the dashboard shows it: dates as "YYYY-MM-DD", plus the last day it actually gives access. */
function toPublicSubscription(row: StaffSubscription) {
  const { id, plan, startsOn, endsOn, endedEarlyOn, amount, note, createdAt } = row
  return { id, plan, startsOn: isoDay(startsOn), endsOn: isoDay(endsOn), endedEarlyOn: endedEarlyOn ? isoDay(endedEarlyOn) : null, lastDay: isoDay(lastDayOf(row)), amount, note, createdAt }
}

type SubscriptionInput = { staffId?: unknown; plan?: unknown; startsOn?: unknown; endsOn?: unknown; amount?: unknown; note?: unknown }

// Validates a new period from the Add / renew form.
function parseSubscription(body: SubscriptionInput): { ok: true; data: Omit<Prisma.StaffSubscriptionUncheckedCreateInput, 'id' | 'createdAt'> } | { ok: false; error: string } {
  const plan = typeof body.plan === 'string' ? body.plan.trim() : ''
  if (!plan || plan.length > 40) return { ok: false, error: 'Plan is required (up to 40 characters).' }
  if (typeof body.staffId !== 'string' || !body.staffId) return { ok: false, error: 'Choose a receptionist.' }
  const startsOn = parseDateOnly(typeof body.startsOn === 'string' ? body.startsOn : undefined)
  const endsOn = parseDateOnly(typeof body.endsOn === 'string' ? body.endsOn : undefined)
  if (!startsOn || !endsOn) return { ok: false, error: 'Start and end dates are required.' }
  if (endsOn < startsOn) return { ok: false, error: 'The end date must be on or after the start date.' }
  if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount < 0 || body.amount > maxAmount) return { ok: false, error: 'Amount must be whole rupees, from 0 to 1,00,00,000.' }
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return { ok: false, error: 'Note must be text.' }
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (note.length > 300) return { ok: false, error: 'Note must be 300 characters or fewer.' }
  return { ok: true, data: { staffId: body.staffId, plan, startsOn, endsOn, amount: body.amount, note: note || null } }
}

/** Subscription routes. The /subscriptions ones are owner-only (staffGuard); /my-subscription is for any staff. */
export const subscriptionRouter = Router()

// Every receptionist with their status and full history, newest period first.
subscriptionRouter.get('/subscriptions', async (_request, response) => {
  const receptionists = await prisma.superAdmin.findMany({
    where: { staffRole: StaffRole.RECEPTIONIST },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, propertyIds: true, subscriptions: true },
  })
  response.json(receptionists.map(({ subscriptions, ...staff }) => ({ ...staff, status: statusOf(subscriptions), history: byLastDay(subscriptions).map(toPublicSubscription) })))
})

subscriptionRouter.post('/subscriptions', async (request, response) => {
  const parsed = parseSubscription(request.body as SubscriptionInput)
  if (!parsed.ok) { response.status(400).json({ error: parsed.error }); return }
  try {
    const staff = await prisma.superAdmin.findUnique({ where: { id: parsed.data.staffId }, select: { staffRole: true } })
    if (!staff) { response.status(404).json({ error: 'That receptionist was not found.' }); return }
    if (staff.staffRole !== StaffRole.RECEPTIONIST) { response.status(400).json({ error: 'Only receptionists have subscriptions.' }); return }
    const created = await prisma.staffSubscription.create({ data: parsed.data })
    response.status(201).json(toPublicSubscription(created))
  } catch (error) {
    console.error('Subscription save failed:', error)
    response.status(503).json({ error: 'The subscription could not be saved.' })
  }
})

// Removes a period entered by mistake. If it was the current one, the status falls back to the one before.
subscriptionRouter.delete('/subscriptions/:id', async (request, response) => {
  try {
    await prisma.staffSubscription.delete({ where: { id: request.params.id } })
    response.status(204).send()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'That subscription was not found.' }); return }
    console.error('Subscription delete failed:', error)
    response.status(503).json({ error: 'The subscription could not be deleted.' })
  }
})

// Ends the receptionist's access now: every period still running (or starting later) is marked ended
// early today, keeping its recorded dates and amount. Their sessions are left for the per-request check
// (auth.ts) to end on their next request: it says why before deleting them, which a deleted session could not.
subscriptionRouter.post('/subscriptions/staff/:staffId/end', async (request, response) => {
  const { staffId } = request.params
  const today = propertyToday()
  try {
    const { count } = await prisma.staffSubscription.updateMany({ where: { staffId, endsOn: { gte: today }, endedEarlyOn: null }, data: { endedEarlyOn: today } })
    if (!count) { response.status(409).json({ error: 'This receptionist has no running subscription to end.' }); return }
    response.json({ status: statusOf(await prisma.staffSubscription.findMany({ where: { staffId }, select: { endsOn: true, endedEarlyOn: true } })) })
  } catch (error) {
    console.error('Ending subscription failed:', error)
    response.status(503).json({ error: 'The subscription could not be ended.' })
  }
})

// The signed-in receptionist's own subscription (read-only), for their Subscription page and banner.
subscriptionRouter.get('/my-subscription', async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const rows = byLastDay(await prisma.staffSubscription.findMany({ where: { staffId: userId } }))
  response.json({ status: statusOf(rows), current: rows[0] ? toPublicSubscription(rows[0]) : null, history: rows.map(toPublicSubscription) })
})
