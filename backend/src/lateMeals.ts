import { LateMealStatus, Prisma } from '@prisma/client'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma } from './db.js'
import { addDays, daysShown, isEating, isMeal, isoDate, mealOf, mealRules, mealTimesOf, mealTypes, requireFoodPlan, requireResident } from './food.js'
import { requirePortalAccess } from './residentPortal.js'

/**
 * Late meal requests: once a meal's 9 pm-the-day-before cutoff has passed, a resident who is not down
 * for it can still ask to eat it, until it starts. Reception or a super admin approves or declines;
 * approving sets the resident's choice to eating, so the Kitchen headcount counts them. Only asking to
 * eat needs approval: someone who will not eat a meal they are counted for can simply not come.
 */

const maxNoteLength = 200

/** Resident route; mounted with the other resident routes, before the staff guard. */
export const lateMealResidentRouter = Router()

// Asks for one meal, e.g. { date: '2026-10-21', meal: 'lunch' }. The rules are the server's, in property time.
lateMealResidentRouter.post('/resident-portal/food/late-requests', requireResident, requirePortalAccess, requireFoodPlan, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const propertyId = response.locals.propertyId as string
  const { date: rawDate, meal } = request.body as { date?: string; meal?: unknown }
  const date = parseDateOnly(rawDate)
  if (!date || !isMeal(meal)) { response.status(400).json({ error: 'Choose a day and a meal.' }); return }
  try {
    const now = propertyNow()
    const today = parseDateOnly(now.date) as Date
    if (date < today || date >= addDays(today, daysShown)) { response.status(400).json({ error: `Meals can be requested up to ${daysShown} days ahead.` }); return }
    const key = isoDate(date)
    const [times, choice] = await Promise.all([mealTimesOf(propertyId), prisma.mealChoice.findUnique({ where: { residentId_date_meal: { residentId: userId, date, meal: mealTypes[meal] } }, select: { eating: true } })])
    const rules = mealRules(key, times[meal], now)
    if (rules.canChange) { response.status(409).json({ error: 'You can still choose this meal yourself in the weekly menu.' }); return }
    if (rules.hasStarted) { response.status(409).json({ error: 'This meal has already started, so it can no longer be requested.' }); return }
    if (isEating(key, choice?.eating)) { response.status(409).json({ error: 'You are already down for this meal.' }); return }
    await prisma.lateMealRequest.create({ data: { residentId: userId, propertyId, date, meal: mealTypes[meal] } })
    response.status(201).json({ status: LateMealStatus.PENDING })
  } catch (error) {
    // One request per meal: a second one (or one after a decline) hits the unique key.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { response.status(409).json({ error: 'You have already requested this meal.' }); return }
    console.error('Late meal request failed:', error)
    response.status(503).json({ error: 'Your request could not be sent.' })
  }
})

const requestSelect = { id: true, date: true, meal: true, status: true, staffNote: true, decidedAt: true, decidedByName: true, createdAt: true, resident: { select: { name: true, room: { select: { number: true } } } } } as const

const toView = ({ date, meal, resident, ...request }: Prisma.LateMealRequestGetPayload<{ select: typeof requestSelect }>) =>
  ({ ...request, date: isoDate(date), meal: mealOf(meal), residentName: resident.name, room: resident.room?.number ?? '' })

/**
 * Staff routes for the Kitchen page. Under /properties/:id, so staffGuard keeps receptionists to their
 * own properties; both receptionists and super admins may decide. Mounted behind the staff sign-in check.
 */
export const lateMealAdminRouter = Router()

// Requests for today onwards: pending first (soonest meal first), then the decided ones.
lateMealAdminRouter.get('/properties/:id/late-meal-requests', async (request, response) => {
  try {
    const today = parseDateOnly(propertyNow().date) as Date
    const rows = await prisma.lateMealRequest.findMany({ where: { propertyId: request.params.id, date: { gte: today } }, orderBy: [{ date: 'asc' }, { meal: 'asc' }, { createdAt: 'asc' }], select: requestSelect })
    const views = rows.map(toView)
    response.json([...views.filter((item) => item.status === LateMealStatus.PENDING), ...views.filter((item) => item.status !== LateMealStatus.PENDING)])
  } catch (error) {
    console.error('Late meal requests could not be loaded:', error)
    response.status(503).json({ error: 'Late meal requests could not be loaded.' })
  }
})

// Approves or declines one request: { approve: true | false, note?: string }. Approving counts them in the headcount.
lateMealAdminRouter.post('/properties/:id/late-meal-requests/:requestId/decision', async (request, response) => {
  const { approve, note: rawNote } = request.body as { approve?: unknown; note?: unknown }
  if (typeof approve !== 'boolean') { response.status(400).json({ error: 'Choose approve or decline.' }); return }
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') { response.status(400).json({ error: 'The note must be text.' }); return }
  const note = rawNote?.trim() || null
  if (note && note.length > maxNoteLength) { response.status(400).json({ error: `Keep the note under ${maxNoteLength} characters.` }); return }
  const { userId } = response.locals.auth as AuthContext
  try {
    const staff = await prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } })
    const decided = await prisma.$transaction(async (transaction) => {
      // Conditional on PENDING, so two staff deciding at once cannot both win.
      const { count } = await transaction.lateMealRequest.updateMany({ where: { id: request.params.requestId, propertyId: request.params.id, status: LateMealStatus.PENDING }, data: { status: approve ? LateMealStatus.APPROVED : LateMealStatus.DECLINED, staffNote: note, decidedAt: new Date(), decidedByName: staff?.name ?? null } })
      if (!count) return null
      const row = await transaction.lateMealRequest.findUniqueOrThrow({ where: { id: request.params.requestId }, select: { ...requestSelect, residentId: true } })
      if (approve) {
        const key = { residentId: row.residentId, date: row.date, meal: row.meal }
        await transaction.mealChoice.upsert({ where: { residentId_date_meal: key }, create: { ...key, eating: true }, update: { eating: true } })
      }
      return row
    })
    if (!decided) { response.status(409).json({ error: 'This request was already decided or no longer exists.' }); return }
    const { residentId: _residentId, ...row } = decided
    response.json(toView(row))
  } catch (error) {
    console.error('Late meal decision failed:', error)
    response.status(503).json({ error: 'The decision could not be saved.' })
  }
})
