import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { UserRole } from '@prisma/client'
import { authRouter, requireRole } from './auth.js'
import { bookingAdminRouter, bookingPublicRouter } from './bookings.js'
import { notifyAnnouncement, notifyInBackground } from './notifications.js'
import { cronRouter } from './rentReminders.js'
import { whatsappAdminRouter } from './whatsappAdmin.js'
import { financeAdminRouter } from './finance.js'
import { emailAdminRouter } from './emailAdmin.js'
import { fallbackDashboard } from './data.js'
import { prisma } from './db.js'
import { normalizePhone } from './validation.js'
import { parseMealTimes, toMealTimes } from './meals.js'
import { parseAmenities, parseTenantType, parseTotalRooms } from './propertyFeatures.js'
import { parsePropertyRents, syncPropertyRents } from './propertyRent.js'
import { foodAdminRouter, foodResidentRouter } from './food.js'
import { housekeepingAdminRouter, housekeepingResidentRouter } from './housekeeping.js'
import { razorpayResidentRouter, razorpayWebhook } from './razorpay.js'
import { paymentsAdminRouter } from './payments.js'
import { rentAdminRouter } from './rent.js'
import { brandingRouter, settingsRouter } from './settings.js'
import { residentPortalRouter } from './residentPortal.js'
import { residentRouter } from './residents.js'
import { roomsAdminRouter } from './rooms.js'
import { holidaysAdminRouter } from './holidays.js'
import { fireAlertAdminRouter } from './fireAlerts.js'
import { exitAdminRouter } from './exits.js'
import { accountDeletionAdminRouter } from './accountDeletion.js'
import { concessionAdminRouter } from './referrals.js'
import { maintenanceAdminRouter } from './maintenance.js'
import { superAdminRouter } from './superAdmins.js'
import { logIntegrations } from './startupReport.js'
import { dashboardInsights } from './dashboardInsights.js'
import { parsePropertyInfo } from './residentInfo.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors())
// Before the JSON parser: Razorpay signs the raw bytes, so this route needs them unparsed.
app.post('/api/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook)
app.use(express.json({ limit: '6mb' }))

app.use('/api', authRouter)
app.use('/api', residentPortalRouter)
app.use('/api', brandingRouter)
app.use('/api', bookingPublicRouter)
app.use('/api', cronRouter)
app.use('/api', housekeepingResidentRouter)
app.use('/api', foodResidentRouter)
app.use('/api', razorpayResidentRouter)

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
app.use('/api', superAdminRouter)
app.use('/api', residentRouter)
app.use('/api', housekeepingAdminRouter)
app.use('/api', rentAdminRouter)
app.use('/api', paymentsAdminRouter)
app.use('/api', bookingAdminRouter)
app.use('/api', whatsappAdminRouter)
app.use('/api', financeAdminRouter)
app.use('/api', emailAdminRouter)
app.use('/api', settingsRouter)
app.use('/api', foodAdminRouter)
app.use('/api', roomsAdminRouter)
app.use('/api', holidaysAdminRouter)
app.use('/api', fireAlertAdminRouter)
app.use('/api', exitAdminRouter)
app.use('/api', accountDeletionAdminRouter)
app.use('/api', concessionAdminRouter)
app.use('/api', maintenanceAdminRouter)

// Occupancy against the owner's declared capacity; older properties without one fall back to the
// rooms that exist. A property can hold more occupied rooms than declared only if it was lowered
// before this check existed, so the percentage is capped at 100.
function occupancySummary(property: { totalRooms: number | null; rooms: Array<{ occupied: boolean }> }) {
  const occupied = property.rooms.filter((room) => room.occupied).length
  const total = property.totalRooms ?? property.rooms.length
  return { occupancy: `${total ? Math.min(100, Math.round((occupied / total) * 100)) : 0}%`, rooms: `${occupied} / ${total}`, totalRooms: total }
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

  if (!process.env.DATABASE_URL) {
    response.status(201).json({
      source: 'fallback',
      property: { name: name.trim(), location: location.trim(), image: imageUrl?.trim() || 'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80', occupancy: '0%', rooms: '0 / 0', status: 'Healthy', tone: 'sage' },
    })
    return
  }

  try {
    const property = await prisma.property.create({
      data: { name: name.trim(), location: location.trim(), imageUrl: imageUrl?.trim() || 'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80', ...city, ...ownerPhone, ...notice, ...info.data, ...tenantType, ...amenities, ...totalRooms, ...rents.data },
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
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Property updates require a database connection.' }); return }
  try {
    // Capacity cannot drop below the rooms the owner has defined.
    if (totalRooms.totalRooms !== undefined) {
      const defined = await prisma.room.count({ where: { propertyId: request.params.id } })
      if (totalRooms.totalRooms < defined) { response.status(400).json({ error: `This property has ${defined} ${defined === 1 ? 'room' : 'rooms'} defined, so it needs at least ${defined}. Remove free rooms under Rooms first.` }); return }
    }
    // Price and residents' rents change together, so a resident never shows a stale rent.
    const property = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.property.update({ where: { id: request.params.id }, data: { ...(name?.trim() ? { name: name.trim() } : {}), ...(location?.trim() ? { location: location.trim() } : {}), ...(imageUrl?.trim() ? { imageUrl: imageUrl.trim() } : {}), ...(status?.trim() ? { status: status.trim() } : {}), ...city, ...ownerPhone, ...notice, ...info.data, ...(meals ? meals.data : {}), ...tenantType, ...amenities, ...totalRooms, ...rents.data }, include: { rooms: { select: { occupied: true } } } })
      if (Object.keys(rents.data).length) await syncPropertyRents(transaction, updated.id)
      return updated
    })
    const { rooms: _rooms, ...fields } = property
    response.json({ ...fields, ...occupancySummary(property), mealTimes: toMealTimes(property) })
  } catch { response.status(404).json({ error: 'Property could not be updated.' }) }
})

app.get('/api/announcements', async (_request, response) => {
  if (!process.env.DATABASE_URL) { response.json([]); return }
  const announcements = await prisma.announcement.findMany({ include: { property: true }, orderBy: { createdAt: 'desc' } })
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
  if (!process.env.DATABASE_URL) {
    response.json({ ...fallbackDashboard, source: 'fallback' })
    return
  }

  try {
    const [properties, residents, openRequests, pendingBookings] = await prisma.$transaction([
      prisma.property.findMany({ include: { rooms: true } }),
      prisma.resident.count({ where: { active: true } }),
      prisma.maintenanceRequest.count({ where: { status: { not: 'resolved' } } }),
      prisma.booking.count({ where: { status: 'new' } }),
    ])
    const insights = await dashboardInsights(properties)

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
          housekeepingStaff: property.housekeepingStaff,
          mealTimes: toMealTimes(property),
          tenantType: property.tenantType,
          amenities: property.amenities,
          rentWithFood: property.rentWithFood,
          rentWithoutFood: property.rentWithoutFood,
        }
      }),
      activity: insights.activity,
    })
  } catch (error) {
    console.error('Dashboard query failed:', error)
    response.status(503).json({ error: 'Database is configured but unavailable.' })
  }
})

app.listen(port, () => {
  console.log(`Raj-PG API listening on http://localhost:${port}`)
  logIntegrations()
})
