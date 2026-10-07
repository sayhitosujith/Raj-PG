import { Prisma } from '@prisma/client'
import { Router, type Request, type Response } from 'express'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma } from './db.js'
import { notifyInBackground, notifyNewBooking } from './notifications.js'
import { getSettings } from './settings.js'
import { referrerForCode } from './referrals.js'
import { isValidEmail, normalizePhone, phoneRequirement } from './validation.js'

/**
 * Booking requests. Most arrive through the public /book form, which the owner shares on social
 * media with a `?from=` tag so each request records where it came from; the owner can also add
 * phone and walk-in enquiries by hand. Requests are triaged new -> contacted -> accepted/declined
 * and can be turned into a resident.
 */
const publicSources = ['instagram', 'facebook', 'whatsapp', 'google', 'direct'] as const
const ownerSources = [...publicSources, 'phone', 'walk_in'] as const
const statuses = ['new', 'contacted', 'accepted', 'declined'] as const
const maxMessageLength = 500

type BookingBody = { name?: unknown; phone?: unknown; email?: unknown; propertyId?: unknown; moveInDate?: unknown; foodOpted?: unknown; message?: unknown; source?: unknown; /** A resident's referral code from the link (?ref=), public form only. */ referralCode?: unknown }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const isOneOf = <T extends string>(options: readonly T[], value: string): value is T => (options as readonly string[]).includes(value)

/**
 * Validates a request from the public form or the owner. An unknown source from the form counts
 * as "direct" rather than an error: the tag comes from a link someone may have edited.
 */
async function parseBooking(body: BookingBody, allowedSources: readonly string[]) {
  const name = text(body.name)
  if (!name || name.length > 80) return { error: 'Enter your name (up to 80 characters).' } as const
  const phone = normalizePhone(text(body.phone))
  if (!phone) return { error: phoneRequirement } as const
  const email = text(body.email) || null
  if (email && (!isValidEmail(email) || email.length > 120)) return { error: 'Enter a valid email address, or leave it blank.' } as const
  const propertyId = text(body.propertyId)
  if (!propertyId || !(await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } }))) return { error: 'Choose a property.' } as const
  const moveIn = parseDateOnly(text(body.moveInDate) || undefined)
  if (moveIn === null) return { error: 'Enter a valid move-in date.' } as const
  if (moveIn && moveIn.toISOString().slice(0, 10) < propertyNow().date) return { error: 'The move-in date cannot be in the past.' } as const
  const foodOpted = typeof body.foodOpted === 'boolean' ? body.foodOpted : null
  const message = text(body.message)
  if (message.length > maxMessageLength) return { error: `Keep the message under ${maxMessageLength} characters.` } as const
  const rawSource = text(body.source).toLowerCase()
  const source = allowedSources.includes(rawSource) ? rawSource : 'direct'
  return { data: { residentName: name, phone, email, propertyId, moveInDate: moveIn ?? null, foodOpted, message, source } } as const
}

const withProperty = { include: { property: { select: { name: true } }, referrer: { select: { name: true } } } } as const
function toBookingSummary(booking: Prisma.BookingGetPayload<typeof withProperty>) {
  const { property, residentName, referrer, ...fields } = booking
  return { ...fields, name: residentName, property: property.name, referredBy: referrer?.name ?? null }
}

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Booking request was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

// A public form invites spam. Each address may send a few requests per window; the form also has
// a hidden "website" field that people never fill in but naive bots do.
const submitWindowMs = 10 * 60 * 1000
const maxSubmitsPerWindow = 5
const recentSubmits = new Map<string, number[]>()
function isRateLimited(request: Request) {
  const forwarded = request.header('x-forwarded-for')?.split(',')[0]?.trim()
  const key = forwarded || request.socket.remoteAddress || 'unknown'
  const now = Date.now()
  // Bounded memory: under a flood of distinct addresses, forget them all rather than grow forever.
  if (recentSubmits.size > 10_000) recentSubmits.clear()
  const recent = (recentSubmits.get(key) ?? []).filter((time) => now - time < submitWindowMs)
  recentSubmits.set(key, [...recent, now])
  return recent.length >= maxSubmitsPerWindow
}

/** Public routes for the booking form; mounted before the auth guard, so they expose only what the form needs. */
export const bookingPublicRouter = Router()

bookingPublicRouter.get('/public/booking-options', async (_request, response) => {
  try {
    const [settings, properties] = await Promise.all([getSettings(), prisma.property.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, location: true, tenantType: true, rentWithFood: true, rentWithoutFood: true } })])
    // A pasted map link is shown as a link by the form, never as an address.
    response.json({ businessName: settings.businessName, contactPhone: settings.contactPhone, properties })
  } catch (error) { respondToError(response, error, 'The booking form could not be loaded.') }
})

bookingPublicRouter.post('/public/booking-requests', async (request, response) => {
  const body = request.body as BookingBody & { website?: unknown }
  // Honeypot: report success so a bot learns nothing, but store nothing.
  if (text(body.website)) { response.status(201).json({ ok: true }); return }
  if (isRateLimited(request)) { response.status(429).json({ error: 'Too many requests. Please try again in a few minutes, or call us.' }); return }
  try {
    const parsed = await parseBooking(body, publicSources)
    if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
    // Which resident's referral link this came through, if any; an unknown code is simply ignored.
    const referrerResidentId = await referrerForCode(body.referralCode)
    const booking = await prisma.booking.create({ data: { ...parsed.data, referrerResidentId }, include: { property: { select: { name: true } } } })
    // Email the owner straight away; never delays or fails the visitor's submission.
    notifyInBackground(() => notifyNewBooking(booking))
    response.status(201).json({ ok: true })
  } catch (error) { respondToError(response, error, 'Your request could not be sent. Please try again.') }
})

/** Owner routes for booking requests; must be mounted behind the super admin guard. */
export const bookingAdminRouter = Router()

bookingAdminRouter.get('/bookings', async (_request, response) => {
  if (!process.env.DATABASE_URL) { response.json([]); return }
  try {
    const bookings = await prisma.booking.findMany({ ...withProperty, orderBy: { createdAt: 'desc' } })
    response.json(bookings.map(toBookingSummary))
  } catch (error) { respondToError(response, error, 'Booking requests could not be loaded.') }
})

// The owner adds phone and walk-in enquiries themselves.
bookingAdminRouter.post('/bookings', async (request, response) => {
  try {
    const parsed = await parseBooking(request.body as BookingBody, ownerSources)
    if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
    response.status(201).json(toBookingSummary(await prisma.booking.create({ data: parsed.data, ...withProperty })))
  } catch (error) { respondToError(response, error, 'The booking request could not be saved.') }
})

// Triage: change the status, and link the resident the request became.
bookingAdminRouter.put('/bookings/:id', async (request, response) => {
  const { status, residentId } = request.body as { status?: unknown; residentId?: unknown }
  const nextStatus = text(status)
  if (!isOneOf(statuses, nextStatus)) { response.status(400).json({ error: 'Choose a valid status.' }); return }
  const linkedResident = typeof residentId === 'string' && residentId ? residentId : undefined
  try {
    response.json(toBookingSummary(await prisma.booking.update({ where: { id: request.params.id }, data: { status: nextStatus, ...(linkedResident ? { residentId: linkedResident } : {}) }, ...withProperty })))
  } catch (error) { respondToError(response, error, 'The booking request could not be updated.') }
})

bookingAdminRouter.delete('/bookings/:id', async (request, response) => {
  try { await prisma.booking.delete({ where: { id: request.params.id } }); response.status(204).send() } catch (error) { respondToError(response, error, 'The booking request could not be deleted.') }
})
