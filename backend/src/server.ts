import compression from 'compression'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { Prisma, UserRole } from '@prisma/client'
import { authRouter, requireRole } from './auth.js'
import { actAsRouter } from './actAs.js'
import { bookingAdminRouter, bookingPublicRouter } from './bookings.js'
import { publicSiteRouter } from './publicSite.js'
import { notifyAnnouncement, notifyInBackground } from './notifications.js'
import { cronRouter } from './rentReminders.js'
import { whatsappAdminRouter } from './whatsappAdmin.js'
import { financeAdminRouter } from './finance.js'
import { emailAdminRouter } from './emailAdmin.js'
import { fallbackDashboard } from './data.js'
import { prisma, withDatabaseRetry } from './db.js'
import { normalizePhone } from './validation.js'
import { parseMealTimes, toMealTimes } from './meals.js'
import { parseAmenities, parseTenantType, parseTotalRooms } from './propertyFeatures.js'
import { parsePropertyRents, parseSharingPrices, syncPropertyRents } from './propertyRent.js'
import { foodAdminRouter, foodResidentRouter } from './food.js'
import { lateMealAdminRouter, lateMealResidentRouter } from './lateMeals.js'
import { housekeepingAdminRouter, housekeepingResidentRouter } from './housekeeping.js'
import { toWorkerView, workersAdminRouter, workersQuery } from './workers.js'
import { doorLockTasksRouter } from './doorLockTasks.js'
import { doorLocksRouter } from './doorLocks.js'
import { bedReservationsRouter } from './bedReservations.js'
import { razorpayResidentRouter, razorpayWebhook } from './razorpay.js'
import { paymentsAdminRouter } from './payments.js'
import { activeConcessions, rentAdminRouter } from './rent.js'
import { brandingRouter, settingsRouter } from './settings.js'
import { siteContentRouter } from './siteContent.js'
import { residentPortalRouter } from './residentPortal.js'
import { residentRouter } from './residents.js'
import { selfRegistrationRouter } from './selfRegistration.js'
import { roomsAdminRouter } from './rooms.js'
import { bedCounts, roomBedsSelect } from './occupancy.js'
import { holidaysAdminRouter } from './holidays.js'
import { fireAlertAdminRouter } from './fireAlerts.js'
import { exitAdminRouter } from './exits.js'
import { accountDeletionAdminRouter } from './accountDeletion.js'
import { concessionAdminRouter } from './referrals.js'
import { maintenanceAdminRouter } from './maintenance.js'
import { superAdminRouter } from './superAdmins.js'
import { subscriptionRouter } from './subscriptions.js'
import { logIntegrations } from './startupReport.js'
import { dashboardInsights } from './dashboardInsights.js'
import { parsePropertyInfo } from './residentInfo.js'
import { propertyPhotoAdminRouter, propertyPhotoResidentRouter } from './propertyPhotos.js'
import { staffGuard } from './staffGuard.js'
import { recordStaffActivity, staffActivityRouter } from './staffActivity.js'
import { propertyIdWhere, propertyWhere, residentWhere, staffAccess } from './staffAccess.js'
import { announceWrites, liveUpdatesRouter } from './liveUpdates.js'
import { isWeatherCity } from './weather.js'

// The price-by-sharing fields the dashboard and Edit property need.
const sharingPriceFields = { beds: true, rentWithFood: true, rentWithoutFood: true } as const

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors())
// Gzip for JSON answers: lists such as residents and the dashboard shrink to roughly a fifth, which is
// most of the wait on a 2G or weak 3G link. The live-updates stream sets `Cache-Control: no-transform`,
// which this middleware honours, so its events are never held back in a compression buffer.
app.use(compression())
// Before the JSON parser: Razorpay signs the raw bytes, so this route needs them unparsed.
app.post('/api/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook)
// A resident form can carry a profile photo and two ID documents (2 MB each, about 2.7 MB as base64).
app.use(express.json({ limit: '10mb' }))
// API answers are live data (notifications, rent, requests): never let the browser or Netlify's edge
// reuse an old copy, or the app shows stale counts until a hard refresh. Image routes set their own
// long cache (their URLs change when the image does), which replaces this.
app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })

// Live updates: open pages are told the moment any write succeeds (see liveUpdates.ts).
app.use('/api', announceWrites)
app.use('/api', liveUpdatesRouter)
app.use('/api', authRouter)
app.use('/api', residentPortalRouter)
app.use('/api', brandingRouter)
app.use('/api', bookingPublicRouter)
// The resident opening their registration link has no account yet.
app.use('/api', selfRegistrationRouter)
app.use('/api', publicSiteRouter)
app.use('/api', cronRouter)
app.use('/api', housekeepingResidentRouter)
app.use('/api', foodResidentRouter)
app.use('/api', lateMealResidentRouter)
app.use('/api', razorpayResidentRouter)
app.use('/api', propertyPhotoResidentRouter)

app.get('/api/health', async (_request, response) => {
  if (!process.env.DATABASE_URL) {
    response.json({ ok: true, database: 'fallback', message: 'Set DATABASE_URL to enable PostgreSQL.' })
    return
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    response.json({ ok: true, database: 'postgresql' })
  } catch {
    response.status(503).json({ ok: false, database: 'unavailable' })
  }
})

// Everything below is the owner dashboard API, reserved for super admins.
app.use('/api', requireRole(UserRole.SUPER_ADMIN))
// Receptionists (not super admins) are limited to their own properties and to day-to-day work; see staffGuard.ts.
app.use('/api', staffGuard)
// Receptionists' changes are recorded for the super admins' notifications (see staffActivity.ts).
app.use('/api', recordStaffActivity)
app.use('/api', staffActivityRouter)
app.use('/api', actAsRouter)
app.use('/api', superAdminRouter)
app.use('/api', subscriptionRouter)
app.use('/api', residentRouter)
app.use('/api', housekeepingAdminRouter)
app.use('/api', workersAdminRouter)
app.use('/api', doorLockTasksRouter)
app.use('/api', doorLocksRouter)
app.use('/api', bedReservationsRouter)
app.use('/api', rentAdminRouter)
app.use('/api', paymentsAdminRouter)
app.use('/api', bookingAdminRouter)
app.use('/api', whatsappAdminRouter)
app.use('/api', financeAdminRouter)
app.use('/api', emailAdminRouter)
app.use('/api', settingsRouter)
app.use('/api', siteContentRouter)
app.use('/api', foodAdminRouter)
app.use('/api', lateMealAdminRouter)
app.use('/api', roomsAdminRouter)
app.use('/api', holidaysAdminRouter)
app.use('/api', fireAlertAdminRouter)
app.use('/api', exitAdminRouter)
app.use('/api', accountDeletionAdminRouter)
app.use('/api', concessionAdminRouter)
app.use('/api', maintenanceAdminRouter)
app.use('/api', propertyPhotoAdminRouter)

// Occupancy in beds (see bedCounts); older properties without a declared room count fall back to the
// rooms that exist. Capped at 100% in case a property was made smaller than it once was.
function occupancySummary(property: Parameters<typeof bedCounts>[0]) {
  const { taken, total } = bedCounts(property)
  return { occupancy: `${total ? Math.min(100, Math.round((taken / total) * 100)) : 0}%`, beds: `${taken} / ${total}`, totalRooms: property.totalRooms ?? property.rooms.length }
}

// Optional city for the residents' weather; blank clears it, absent leaves it alone.
function parseCity(value: unknown): { city?: string | null } | { error: string } {
  if (value === undefined) return {}
  if (value !== null && typeof value !== 'string') return { error: 'City must be text.' }
  const city = value?.trim() ?? ''
  if (city.length > 60) return { error: 'City must be 60 characters or fewer.' }
  return { city: city || null }
}

// Optional owner phone, stored as E.164; blank clears it, absent leaves it alone.
function parseOwnerPhone(value: unknown): { ownerPhone?: string | null } | { error: string } {
  if (value === undefined) return {}
  if (value !== null && typeof value !== 'string') return { error: 'Manager number must be text.' }
  const raw = value?.trim() ?? ''
  if (!raw) return { ownerPhone: null }
  const ownerPhone = normalizePhone(raw)
  return ownerPhone ? { ownerPhone } : { error: 'Enter a valid manager number.' }
}

// Optional per-property move-out notice (0–180 days); blank uses Settings, absent leaves it alone.
function parseNoticeDays(value: unknown): { noticePeriodDays?: number | null } | { error: string } {
  if (value === undefined) return {}
  if (value === null || value === '') return { noticePeriodDays: null }
  const days = Number(value)
  return Number.isInteger(days) && days >= 0 && days <= 180 ? { noticePeriodDays: days } : { error: 'Move-out notice must be 0 to 180 days, or blank to use Settings.' }
}

// Whether residents will see weather for a property's City, so the owner hears about a typo when they
// save it rather than residents getting weather only on the days their phone shares its location.
// `found` is null when the weather service could not be asked, which says nothing about the spelling.
app.get('/api/weather/city-check', async (request, response) => {
  const city = typeof request.query.city === 'string' ? request.query.city.trim() : ''
  if (!city) { response.status(400).json({ error: 'City is required.' }); return }
  response.json({ found: await isWeatherCity(city) })
})

app.post('/api/properties', async (request, response) => {
  const { name, location, imageUrl, tenantType: rawTenantType, amenities: rawAmenities, totalRooms: rawTotalRooms, rentWithFood, rentWithoutFood } = request.body as { name?: string; location?: string; imageUrl?: string; tenantType?: unknown; amenities?: unknown; totalRooms?: unknown; rentWithFood?: unknown; rentWithoutFood?: unknown }
  const city = parseCity((request.body as { city?: unknown }).city)
  if ('error' in city) { response.status(400).json({ error: city.error }); return }
  const ownerPhone = parseOwnerPhone((request.body as { ownerPhone?: unknown }).ownerPhone)
  if ('error' in ownerPhone) { response.status(400).json({ error: ownerPhone.error }); return }
  const notice = parseNoticeDays((request.body as { noticePeriodDays?: unknown }).noticePeriodDays)
  if ('error' in notice) { response.status(400).json({ error: notice.error }); return }
  const info = parsePropertyInfo(request.body as Record<string, unknown>)
  if ('error' in info) { response.status(400).json({ error: info.error }); return }
  if (!name?.trim() || !location?.trim()) {
    response.status(400).json({ error: 'Name and location are required.' })
    return
  }
  const tenantType = parseTenantType(rawTenantType, true)
  if ('error' in tenantType) { response.status(400).json({ error: tenantType.error }); return }
  const amenities = parseAmenities(rawAmenities ?? [])
  if ('error' in amenities) { response.status(400).json({ error: amenities.error }); return }
  const totalRooms = parseTotalRooms(rawTotalRooms, true)
  if ('error' in totalRooms) { response.status(400).json({ error: totalRooms.error }); return }
  const rents = parsePropertyRents({ rentWithFood, rentWithoutFood })
  if ('error' in rents) { response.status(400).json({ error: rents.error }); return }
  const sharing = parseSharingPrices((request.body as { sharingPrices?: unknown }).sharingPrices)
  if ('error' in sharing) { response.status(400).json({ error: sharing.error }); return }

  if (!process.env.DATABASE_URL) {
    response.status(201).json({
      source: 'fallback',
      property: { name: name.trim(), location: location.trim(), image: imageUrl?.trim() || 'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80', occupancy: '0%', beds: '0 / 0', status: 'Healthy', tone: 'sage' },
    })
    return
  }

  try {
    const property = await prisma.property.create({
      data: { name: name.trim(), location: location.trim(), imageUrl: imageUrl?.trim() || 'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80', ...city, ...ownerPhone, ...notice, ...info.data, ...tenantType, ...amenities, ...totalRooms, ...rents.data, ...(sharing.rows?.length ? { sharingPrices: { create: sharing.rows } } : {}) },
      include: { sharingPrices: { select: sharingPriceFields } },
    })
    response.status(201).json({ source: 'postgresql', property: { ...property, image: property.imageUrl, ...occupancySummary({ ...property, rooms: [] }), tone: 'sage', mealTimes: toMealTimes(property) } })
  } catch (error) {
    console.error('Property creation failed:', error)
    response.status(503).json({ error: 'Property could not be saved.' })
  }
})

app.delete('/api/properties/:id', async (request, response) => {
  if (!process.env.DATABASE_URL) {
    response.status(501).json({ error: 'Property deletion requires a database connection.' })
    return
  }

  try {
    await prisma.property.delete({ where: { id: request.params.id } })
    response.status(204).send()
  } catch (error) {
    console.error('Property deletion failed:', error)
    response.status(404).json({ error: 'Property was not found or could not be deleted.' })
  }
})

app.put('/api/properties/:id', async (request, response) => {
  const { name, location, imageUrl, status, mealTimes, tenantType: rawTenantType, amenities: rawAmenities, totalRooms: rawTotalRooms, rentWithFood, rentWithoutFood } = request.body as { name?: string; location?: string; imageUrl?: string; status?: string; mealTimes?: unknown; tenantType?: unknown; amenities?: unknown; totalRooms?: unknown; rentWithFood?: unknown; rentWithoutFood?: unknown }
  const meals = mealTimes === undefined ? undefined : parseMealTimes(mealTimes)
  if (meals && 'error' in meals) { response.status(400).json({ error: meals.error }); return }
  const city = parseCity((request.body as { city?: unknown }).city)
  if ('error' in city) { response.status(400).json({ error: city.error }); return }
  const ownerPhone = parseOwnerPhone((request.body as { ownerPhone?: unknown }).ownerPhone)
  if ('error' in ownerPhone) { response.status(400).json({ error: ownerPhone.error }); return }
  const notice = parseNoticeDays((request.body as { noticePeriodDays?: unknown }).noticePeriodDays)
  if ('error' in notice) { response.status(400).json({ error: notice.error }); return }
  const info = parsePropertyInfo(request.body as Record<string, unknown>)
  if ('error' in info) { response.status(400).json({ error: info.error }); return }
  const tenantType = parseTenantType(rawTenantType, false)
  if ('error' in tenantType) { response.status(400).json({ error: tenantType.error }); return }
  const amenities = rawAmenities === undefined ? {} : parseAmenities(rawAmenities)
  if ('error' in amenities) { response.status(400).json({ error: amenities.error }); return }
  const totalRooms = parseTotalRooms(rawTotalRooms, false)
  if ('error' in totalRooms) { response.status(400).json({ error: totalRooms.error }); return }
  const rents = parsePropertyRents({ rentWithFood, rentWithoutFood })
  if ('error' in rents) { response.status(400).json({ error: rents.error }); return }
  const sharing = parseSharingPrices((request.body as { sharingPrices?: unknown }).sharingPrices)
  if ('error' in sharing) { response.status(400).json({ error: sharing.error }); return }
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Property updates require a database connection.' }); return }
  try {
    // Capacity cannot drop below the rooms the owner has defined.
    if (totalRooms.totalRooms !== undefined) {
      const defined = await prisma.room.count({ where: { propertyId: request.params.id } })
      if (totalRooms.totalRooms < defined) { response.status(400).json({ error: `This property has ${defined} ${defined === 1 ? 'room' : 'rooms'} defined, so it needs at least ${defined}. Remove free rooms under Rooms first.` }); return }
    }
    // Price and residents' rents change together, so a resident never shows a stale rent. Retried when the
    // database drops the connection: it writes the same values again, so a repeat is harmless.
    const property = await withDatabaseRetry(() => prisma.$transaction(async (transaction) => {
      const updated = await transaction.property.update({ where: { id: request.params.id }, data: { ...(name?.trim() ? { name: name.trim() } : {}), ...(location?.trim() ? { location: location.trim() } : {}), ...(imageUrl?.trim() ? { imageUrl: imageUrl.trim() } : {}), ...(status?.trim() ? { status: status.trim() } : {}), ...city, ...ownerPhone, ...notice, ...info.data, ...(meals ? meals.data : {}), ...tenantType, ...amenities, ...totalRooms, ...rents.data, ...(sharing.rows ? { sharingPrices: { deleteMany: {}, create: sharing.rows } } : {}) }, include: { rooms: { select: roomBedsSelect }, sharingPrices: { select: sharingPriceFields } } })
      if (Object.keys(rents.data).length || sharing.rows) await syncPropertyRents(transaction, updated.id)
      return updated
    }))
    const { rooms: _rooms, ...fields } = property
    response.json({ ...fields, ...occupancySummary(property), mealTimes: toMealTimes(property) })
  } catch (error) {
    // P2025: no property with this id. Anything else (a dropped database connection, say) is logged, so a
    // failed save can be traced, and the owner is told to try again rather than that the PG is missing.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Property not found.' }); return }
    console.error('Property update failed:', error)
    response.status(503).json({ error: 'The property could not be saved. Please try again.' })
  }
})

app.get('/api/announcements', async (_request, response) => {
  if (!process.env.DATABASE_URL) { response.json([]); return }
  const announcements = await prisma.announcement.findMany({ where: propertyIdWhere(staffAccess(response)), include: { property: true }, orderBy: { createdAt: 'desc' } })
  response.json(announcements.map((announcement) => ({ ...announcement, property: announcement.property.name })))
})

app.post('/api/announcements', async (request, response) => {
  const { title, message, propertyId } = request.body as { title?: string; message?: string; propertyId?: string }
  if (!title?.trim() || !message?.trim() || !propertyId) { response.status(400).json({ error: 'Title, message, and property are required.' }); return }
  try {
    const announcement = await prisma.announcement.create({ data: { title: title.trim(), message: message.trim(), propertyId } })
    notifyInBackground(() => notifyAnnouncement(announcement))
    response.status(201).json(announcement)
  } catch { response.status(400).json({ error: 'Announcement could not be created.' }) }
})

app.put('/api/announcements/:id', async (request, response) => {
  const { title, message } = request.body as { title?: string; message?: string }
  try { response.json(await prisma.announcement.update({ where: { id: request.params.id }, data: { ...(title?.trim() ? { title: title.trim() } : {}), ...(message?.trim() ? { message: message.trim() } : {}) } })) } catch { response.status(404).json({ error: 'Announcement could not be updated.' }) }
})

app.delete('/api/announcements/:id', async (request, response) => {
  try { await prisma.announcement.delete({ where: { id: request.params.id } }); response.status(204).send() } catch { response.status(404).json({ error: 'Announcement could not be deleted.' }) }
})

app.get('/api/dashboard', async (_request, response) => {
  const access = staffAccess(response)
  if (!process.env.DATABASE_URL) {
    response.json({ ...fallbackDashboard, source: 'fallback' })
    return
  }

  try {
    // Retried, like the residents list and the Kitchen: Neon's pooled endpoint drops an idle connection now
    // and then, and the Overview is the first page everyone opens.
    const [properties, residents, openRequests, pendingBookings] = await withDatabaseRetry(() => prisma.$transaction([
      prisma.property.findMany({ where: propertyWhere(access), include: { rooms: { select: { ...roomBedsSelect, number: true, residents: { select: { id: true, name: true, phone: true, joinedAt: true, bedNumber: true, profilePhotoUpdatedAt: true, monthlyRent: true, rentTrackedFrom: true, active: true, rentPayments: { select: { month: true } }, ...activeConcessions } }, reservations: { select: { id: true, bedNumber: true, note: true, reservedByName: true, createdAt: true } } } }, sharingPrices: { select: sharingPriceFields }, workers: workersQuery } }),
      prisma.resident.count({ where: { active: true, ...residentWhere(access) } }),
      prisma.maintenanceRequest.count({ where: { status: { not: 'resolved' }, ...propertyIdWhere(access) } }),
      prisma.booking.count({ where: { status: 'new', ...propertyIdWhere(access) } }),
    ]))
    const insights = await withDatabaseRetry(() => dashboardInsights(properties, access))

    response.json({
      source: 'postgresql',
      stats: {
        properties: String(properties.length).padStart(2, '0'),
        residents: String(residents),
        collected: insights.collected,
        openRequests: String(openRequests),
        // Drives the Bookings badge in the sidebar: requests still waiting for a decision.
        pendingBookings,
      },
      // Detail lines under the stat cards, the monthly insight and the quick tip, all from real data.
      details: insights.details,
      insight: insights.insight,
      tip: insights.tip,
      properties: properties.map((property) => {
        return {
          id: property.id,
          name: property.name,
          location: property.location,
          city: property.city,
          ownerPhone: property.ownerPhone,
          noticePeriodDays: property.noticePeriodDays,
          websiteUrl: property.websiteUrl,
          wifiName: property.wifiName,
          wifiPassword: property.wifiPassword,
          contacts: property.contacts,
          checkInTime: property.checkInTime,
          checkOutTime: property.checkOutTime,
          gateClosingTime: property.gateClosingTime,
          ...occupancySummary(property),
          status: property.status,
          tone: property.status === 'Healthy' ? 'sage' : 'gold',
          image: property.imageUrl,
          workers: property.workers.map(toWorkerView),
          mealTimes: toMealTimes(property),
          tenantType: property.tenantType,
          amenities: property.amenities,
          rentWithFood: property.rentWithFood,
          rentWithoutFood: property.rentWithoutFood,
          sharingPrices: [...property.sharingPrices].sort((a, b) => a.beds - b.beds),
        }
      }),
      activity: insights.activity,
    })
  } catch (error) {
    console.error('Dashboard query failed:', error)
    response.status(503).json({ error: 'Database is configured but unavailable.' })
  }
})

// Express 5 hands a bind failure (e.g. EADDRINUSE) to this callback instead of throwing. Ignoring it
// printed "listening" while an older server kept the port and answered every request, so exit loudly.
app.listen(port, (error?: Error) => {
  if (error) {
    console.error(`Raj-PG API could not start on port ${port}: ${error.message}. Is another copy of the backend already running?`)
    process.exit(1)
  }
  console.log(`Raj-PG API listening on http://localhost:${port}`)
  logIntegrations()
})
