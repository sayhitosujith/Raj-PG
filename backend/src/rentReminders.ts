import { timingSafeEqual } from 'node:crypto'
import { Router, type Request } from 'express'
import { prisma } from './db.js'
import { isEmailEnabled } from './emailClient.js'
import { notifyRent, recipientSelect } from './notifications.js'
import { activeConcessions, rentStatus } from './rent.js'
import { getSettings, rentRulesOf } from './settings.js'
import { isWhatsAppEnabled } from './whatsappClient.js'

/**
 * The daily rent-reminder run (WhatsApp and email). Render's free plan sleeps, so nothing inside
 * the app can wake it on schedule; an external cron (cron-job.org) calls /api/cron/rent-reminders
 * once a day with the CRON_SECRET. Each resident gets reminders 1, 2 and 3 and the overdue notice
 * at most once per month and channel (notifyRent's dedupe key), so calling it more often is harmless.
 */
const dueDateLabel = (month: string, dueDay: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, dueDay)).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })

export async function runRentReminders() {
  if (!isWhatsAppEnabled() && !isEmailEnabled()) return { skipped: 'Neither WhatsApp nor email is configured.' }
  const rules = rentRulesOf(await getSettings())
  const residents = await prisma.resident.findMany({ where: { active: true, monthlyRent: { not: null } }, select: { ...recipientSelect, monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentPayments: { select: { month: true } }, ...activeConcessions, room: { select: { property: { select: { name: true } } } } } })
  const sent = { reminder1: 0, reminder2: 0, reminder3: 0, overdue: 0 }
  for (const resident of residents) {
    const status = rentStatus(resident, resident.rentPayments.map((payment) => payment.month), rules)
    const stage = status.state === 'LOCK_DUE' ? 'overdue' : status.state === 'REMINDER_3' ? 'reminder3' : status.state === 'REMINDER_2' ? 'reminder2' : status.state === 'REMINDER_1' ? 'reminder1' : null
    if (!stage || !status.outstandingMonths.length) continue
    await notifyRent(resident, stage, { amount: status.amountDue, months: status.outstandingMonths, dueDate: dueDateLabel(status.outstandingMonths[0], rules.dueDay), lockDate: dueDateLabel(status.outstandingMonths[0], rules.dueDay + 1), property: resident.room?.property.name ?? '' })
    sent[stage] += 1
  }
  return { checked: residents.length, attempted: sent }
}

// Constant-time comparison, so the secret cannot be guessed from response timing.
function hasCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET
  const given = request.header('x-cron-key') ?? (typeof request.query.key === 'string' ? request.query.key : '')
  if (!secret || !given) return false
  const expected = Buffer.from(secret)
  const received = Buffer.from(given)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/** Scheduled jobs, authorised by CRON_SECRET rather than a session; mounted before the auth guard. */
export const cronRouter = Router()

cronRouter.all('/cron/rent-reminders', async (request, response) => {
  if (!process.env.CRON_SECRET) { response.status(503).json({ error: 'CRON_SECRET is not set on the server.' }); return }
  if (!hasCronSecret(request)) { response.status(401).json({ error: 'Invalid cron key.' }); return }
  try {
    response.json(await runRentReminders())
  } catch (error) {
    console.error('Rent reminder run failed:', error)
    response.status(503).json({ error: 'The reminder run failed.' })
  }
})
