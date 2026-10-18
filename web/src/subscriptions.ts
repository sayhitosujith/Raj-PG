import type { Notice } from './NotificationBell'
import { readApiError } from './superAdmin'

/** Where a receptionist's subscription stands today, as the API works it out (India time). daysLeft 0 = last day. */
export type SubscriptionStatus =
  | { state: 'NOT_SET'; endsOn: null; daysLeft: null }
  | { state: 'ACTIVE' | 'ENDING_SOON' | 'ENDED'; endsOn: string; daysLeft: number }

/**
 * One paid period. Dates are "YYYY-MM-DD" and inclusive; amount is whole rupees. endedEarlyOn is the day
 * End now was used; lastDay is the last day it actually gives access (endsOn, or the day before that).
 */
export type Subscription = { id: string; plan: string; startsOn: string; endsOn: string; endedEarlyOn: string | null; lastDay: string; amount: number; note: string | null; createdAt: string }

/** A receptionist on the owner's Subscriptions page, newest period first. */
export type ReceptionistSubscriptions = { id: string; name: string; email: string; propertyIds: string[]; status: SubscriptionStatus; history: Subscription[] }

/** The signed-in receptionist's own subscription (GET /api/my-subscription). */
export type MySubscription = { status: SubscriptionStatus; current: Subscription | null; history: Subscription[] }

/** Sent with the 401/403 that turns away a receptionist whose subscription ended. */
export const subscriptionEndedCode = 'SUBSCRIPTION_ENDED'

/** Plan choices in the Add / renew form and how far each one runs; Custom leaves the end date to the owner. */
export const planLengths: Record<string, { months: number } | null> = { Monthly: { months: 1 }, Quarterly: { months: 3 }, 'Half-yearly': { months: 6 }, Yearly: { months: 12 }, Custom: null }

const toDate = (day: string) => new Date(`${day}T00:00:00Z`)
const toDay = (date: Date) => date.toISOString().slice(0, 10)

/** "YYYY-MM-DD" shifted by whole days. */
export function addDays(day: string, days: number) {
  const date = toDate(day)
  date.setUTCDate(date.getUTCDate() + days)
  return toDay(date)
}

/**
 * The last day of a plan starting on `startsOn`: one day before the same date `months` later, so a
 * Monthly plan from 18 Oct runs to 17 Nov. A start on the 31st into a shorter month ends on that month's last day.
 */
export function planEndsOn(startsOn: string, months: number) {
  const start = toDate(startsOn)
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1))
  const lastDayOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(start.getUTCDate(), lastDayOfTarget))
  return addDays(toDay(target), -1)
}

/** Today in India as "YYYY-MM-DD", matching how the API dates subscriptions. */
export function indiaToday(now = new Date()) {
  return toDay(new Date(now.getTime() + 5.5 * 60 * 60 * 1000))
}

/** "17 Nov 2026". */
export function formatDay(day: string) {
  return toDate(day).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
}

/** "18 Oct 2026 – 17 Nov 2026", with "· ended early on 18 Oct 2026" when End now cut it short. */
export function periodText(period: Pick<Subscription, 'startsOn' | 'endsOn' | 'endedEarlyOn'>) {
  return `${formatDay(period.startsOn)} – ${formatDay(period.endsOn)}${period.endedEarlyOn ? ` · ended early on ${formatDay(period.endedEarlyOn)}` : ''}`
}

/** Pill text and colour for a status. */
export function statusBadge(status: SubscriptionStatus): { label: string; tone: 'sage' | 'gold' | 'coral' | 'muted' } {
  if (status.state === 'NOT_SET') return { label: 'Not set', tone: 'muted' }
  if (status.state === 'ENDED') return { label: `Ended ${formatDay(status.endsOn)}`, tone: 'coral' }
  return { label: daysLeftText(status.daysLeft), tone: status.state === 'ENDING_SOON' ? 'gold' : 'sage' }
}

/** Every receptionist with their subscription status and history (owner only). */
export async function fetchSubscriptions() {
  const response = await fetch('/api/subscriptions')
  if (!response.ok) throw new Error(await readApiError(response, 'Subscriptions could not be loaded.'))
  return await response.json() as ReceptionistSubscriptions[]
}

/** "ends today", "ends tomorrow", "ends in 5 days". */
export function endsInText(daysLeft: number) {
  return daysLeft === 0 ? 'ends today' : daysLeft === 1 ? 'ends tomorrow' : `ends in ${daysLeft} days`
}

// Notice ids carry the end date and the days left, so from 7 days left the bell alerts afresh every
// day (reading today's does not hide tomorrow's), and a renewal (a new end date) clears it.

/** The receptionist's own bell: their subscription ends within 7 days. */
export function mySubscriptionNotices(subscription: MySubscription | null): Notice[] {
  const status = subscription?.status
  if (status?.state !== 'ENDING_SOON') return []
  return [{ kind: 'Subscription', id: `subscription-me-${status.endsOn}-${status.daysLeft}`, title: `Your subscription ${endsInText(status.daysLeft)}`, detail: `Last day ${formatDay(status.endsOn)}. Ask your super admin to renew it, or you will not be able to sign in.` }]
}

/** The super admin's bell: each receptionist whose subscription ends within 7 days. */
export function receptionistSubscriptionNotices(receptionists: ReceptionistSubscriptions[] | null): Notice[] {
  return (receptionists ?? []).flatMap(({ id, name, status }) => status.state !== 'ENDING_SOON' ? [] : [{ kind: 'Subscription' as const, id: `subscription-${id}-${status.endsOn}-${status.daysLeft}`, title: `${name}'s subscription ${endsInText(status.daysLeft)}`, detail: `Last day ${formatDay(status.endsOn)}. Renew it under Subscriptions, or they cannot sign in after that.` }])
}

/** "Ends today", "1 day left", "23 days left". */
export function daysLeftText(daysLeft: number) {
  return daysLeft === 0 ? 'Ends today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
}
