import { LateMealStatus, Prisma } from '@prisma/client'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma, withDatabaseRetry } from './db.js'
import { addDays, daysShown, isEating, isMeal, isoDate, mealOf, mealRules, mealTimesOf, mealTypes, requireFoodPlan, requireResident } from './food.js'
import { requirePortalAccess } from './residentPortal.js'
import { getSettings } from './settings.js'

/**
 * Late meal requests: once a meal's 11:59 pm-the-day-before cutoff has passed, a resident who is not down
 * for it can still ask to eat it, until it starts. Reception or a super admin approves or declines;
 * approving sets the resident's choice to eating, so the Kitchen headcount counts them. At most
 * `lateMealLimit` (Settings) can be approved per meal at a property. Only asking to eat needs approval:
 * someone who will not eat a meal they are counted for can simply not come.
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

// No food plan, no meals: a request from someone since taken off the plan (or moved out) is not shown or served.
const stillOnFoodPlan = { resident: { active: true, foodOpted: true } }

// Requests for today onwards from residents still on the food plan: pending first (soonest meal first), then the decided ones.
lateMealAdminRouter.get('/properties/:id/late-meal-requests', async (request, response) => {
  try {
    const today = parseDateOnly(propertyNow().date) as Date
    const rows = await withDatabaseRetry(() => prisma.lateMealRequest.findMany({ where: { propertyId: request.params.id, date: { gte: today }, ...stillOnFoodPlan }, orderBy: [{ date: 'asc' }, { meal: 'asc' }, { createdAt: 'asc' }], select: requestSelect }))
    const views = rows.map(toView)
    response.json([...views.filter((item) => item.status === LateMealStatus.PENDING), ...views.filter((item) => item.status !== LateMealStatus.PENDING)])
  } catch (error) {
    console.error('Late meal requests could not be loaded:', error)
    response.status(503).json({ error: 'Late meal requests could not be loaded.' })
  }
})

// Approves or declines one request: { approve: true | false, note?: string }. Approving counts them in the
// headcount; declining an approved one takes them out again. A decision can be changed either way until
// the meal starts, after which it no longer affects anything and stays as it was.
lateMealAdminRouter.post('/properties/:id/late-meal-requests/:requestId/decision', async (request, response) => {
  const { approve, note: rawNote } = request.body as { approve?: unknown; note?: unknown }
  if (typeof approve !== 'boolean') { response.status(400).json({ error: 'Choose approve or decline.' }); return }
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') { response.status(400).json({ error: 'The note must be text.' }); return }
  const note = rawNote?.trim() || null
  if (note && note.length > maxNoteLength) { response.status(400).json({ error: `Keep the note under ${maxNoteLength} characters.` }); return }
  const { userId } = response.locals.auth as AuthContext
  const { id: propertyId, requestId } = request.params
  const target = approve ? LateMealStatus.APPROVED : LateMealStatus.DECLINED
  try {
    const current = await prisma.lateMealRequest.findFirst({ where: { id: requestId, propertyId }, select: { status: true, date: true, meal: true, resident: { select: { active: true, foodOpted: true } } } })
    if (!current) { response.status(404).json({ error: 'That request was not found.' }); return }
    if (approve && !(current.resident.active && current.resident.foodOpted)) { response.status(409).json({ error: 'This resident is no longer on the food plan, so no meal can be served to them.' }); return }
    if (current.status === target) { response.status(409).json({ error: `This request is already ${approve ? 'approved' : 'declined'}.` }); return }
    if (current.status !== LateMealStatus.PENDING) {
      const times = await mealTimesOf(propertyId)
      if (mealRules(isoDate(current.date), times[mealOf(current.meal)], propertyNow()).hasStarted) { response.status(409).json({ error: 'This meal has started, so the decision can no longer be changed.' }); return }
    }
    const [staff, settings] = await Promise.all([prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } }), getSettings()])
    // Serializable, so two staff approving the last place for a meal at the same moment cannot both pass
    // the limit check; the loser gets P2034 and is asked to try again.
    const decided = await prisma.$transaction(async (transaction) => {
      if (approve) {
        const approved = await transaction.lateMealRequest.count({ where: { propertyId, date: current.date, meal: current.meal, status: LateMealStatus.APPROVED, ...stillOnFoodPlan } })
        if (approved >= settings.lateMealLimit) return { limitReached: approved } as const
      }
      // Conditional on the status read above, so two staff deciding at once cannot both win.
      const { count } = await transaction.lateMealRequest.updateMany({ where: { id: requestId, propertyId, status: current.status }, data: { status: target, staffNote: note, decidedAt: new Date(), decidedByName: staff?.name ?? null } })
      if (!count) return null
      const row = await transaction.lateMealRequest.findUniqueOrThrow({ where: { id: requestId }, select: { ...requestSelect, residentId: true } })
      // Approving puts them down as eating; declining an approval takes them off again. Declining a
      // pending request changes nothing: they were not eating.
      if (approve || current.status === LateMealStatus.APPROVED) {
        const key = { residentId: row.residentId, date: row.date, meal: row.meal }
        await transaction.mealChoice.upsert({ where: { residentId_date_meal: key }, create: { ...key, eating: approve }, update: { eating: approve } })
      }
      return row
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    if (!decided) { response.status(409).json({ error: 'Someone else just decided this request. Refresh to see it.' }); return }
    if ('limitReached' in decided) { response.status(409).json({ error: `${decided.limitReached} late requests are already approved for this meal, the most allowed (Settings → Late meal requests).` }); return }
    const { residentId: _residentId, ...row } = decided
    response.json(toView(row))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') { response.status(409).json({ error: 'Someone else decided a request for this meal at the same moment. Please try again.' }); return }
    console.error('Late meal decision failed:', error)
    response.status(503).json({ error: 'The decision could not be saved.' })
  }
})
