import { MealType, Prisma, UserRole } from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { requireRole, type AuthContext } from './auth.js'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma } from './db.js'
import { meals, toMealTimes } from './meals.js'
import { requirePortalAccess } from './residentPortal.js'

/**
 * Food menu: a repeating weekly menu per property, residents skipping meals ahead of time (so the
 * owner sees headcounts), and thumbs up/down feedback on meals that have been served.
 * All time rules are decided here in property-local time; the UIs only show what is allowed.
 */
type Meal = (typeof meals)[number]
const mealTypes: Record<Meal, MealType> = { breakfast: MealType.BREAKFAST, lunch: MealType.LUNCH, dinner: MealType.DINNER }
const mealOf = (type: MealType) => meals.find((meal) => mealTypes[meal] === type) as Meal
const isMeal = (value: unknown): value is Meal => typeof value === 'string' && (meals as readonly string[]).includes(value)

const daysShown = 7
const maxItemsLength = 200
const maxCommentLength = 300
const feedbackDays = 7
const msPerDay = 24 * 60 * 60 * 1000

/** ISO weekday (1 = Monday … 7 = Sunday) of a date-only value stored at UTC midnight. */
const weekdayOf = (date: Date) => ((date.getUTCDay() + 6) % 7) + 1
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * msPerDay)
const isoDate = (date: Date) => date.toISOString().slice(0, 10)
const toMinutes = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }

type MealWindow = { from: string; to: string }

// A meal can be skipped until it starts, and rated once it has started (today only) if not skipped.
function mealRules(date: string, window: MealWindow, now: { date: string; minutes: number }) {
  const started = date < now.date || (date === now.date && now.minutes >= toMinutes(window.from))
  return { canSkip: !started, hasStarted: started, isToday: date === now.date }
}

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Property was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Resident routes; mounted before the super admin guard, so each checks the resident role itself. */
export const foodResidentRouter = Router()
const requireResident = requireRole(UserRole.RESIDENT)

// Residents without a food plan have no menu to skip or rate.
async function requireFoodPlan(_request: Request, response: Response, next: NextFunction) {
  const { userId } = response.locals.auth as AuthContext
  const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { foodOpted: true } })
  if (!resident?.foodOpted) { response.status(403).json({ error: 'Your plan does not include food.', code: 'NO_FOOD_PLAN' }); return }
  next()
}

// The next seven days starting today, each meal with its menu, timing, and what the resident may do.
foodResidentRouter.get('/resident-portal/food', requireResident, requirePortalAccess, requireFoodPlan, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const propertyId = response.locals.propertyId as string
  try {
    const now = propertyNow()
    const today = parseDateOnly(now.date) as Date
    const until = addDays(today, daysShown)
    const [property, menu, skips, feedback] = await Promise.all([
      prisma.property.findUniqueOrThrow({ where: { id: propertyId } }),
      prisma.menuItem.findMany({ where: { propertyId } }),
      prisma.mealSkip.findMany({ where: { residentId: userId, date: { gte: today, lt: until } } }),
      prisma.mealFeedback.findMany({ where: { residentId: userId, date: today } }),
    ])
    const times = toMealTimes(property)
    const days = Array.from({ length: daysShown }, (_, index) => {
      const date = addDays(today, index)
      const key = isoDate(date)
      const weekday = weekdayOf(date)
      return {
        date: key,
        weekday,
        meals: meals.map((meal) => {
          const skipped = skips.some((skip) => isoDate(skip.date) === key && skip.meal === mealTypes[meal])
          const rules = mealRules(key, times[meal], now)
          const own = feedback.find((item) => isoDate(item.date) === key && item.meal === mealTypes[meal])
          return {
            meal,
            ...times[meal],
            items: menu.find((item) => item.weekday === weekday && item.meal === mealTypes[meal])?.items ?? null,
            skipped,
            canSkip: rules.canSkip,
            canRate: rules.isToday && rules.hasStarted && !skipped,
            feedback: own ? { liked: own.liked, comment: own.comment } : null,
          }
        }),
      }
    })
    response.json({ days })
  } catch (error) {
    respondToError(response, error, 'The food menu could not be loaded.')
  }
})

foodResidentRouter.put('/resident-portal/food/skips', requireResident, requirePortalAccess, requireFoodPlan, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { date: rawDate, meal, skipped } = request.body as { date?: string; meal?: unknown; skipped?: unknown }
  const date = parseDateOnly(rawDate)
  if (!date || !isMeal(meal) || typeof skipped !== 'boolean') { response.status(400).json({ error: 'Choose a date and meal.' }); return }
  try {
    const now = propertyNow()
    const today = parseDateOnly(now.date) as Date
    if (date < today || date >= addDays(today, daysShown)) { response.status(400).json({ error: `Meals can be skipped up to ${daysShown} days ahead.` }); return }
    const property = await prisma.property.findUniqueOrThrow({ where: { id: response.locals.propertyId as string } })
    if (!mealRules(isoDate(date), toMealTimes(property)[meal], now).canSkip) { response.status(409).json({ error: 'That meal has already started, so it can no longer be changed.' }); return }
    const key = { residentId: userId, date, meal: mealTypes[meal] }
    if (skipped) await prisma.mealSkip.upsert({ where: { residentId_date_meal: key }, create: key, update: {} })
    else await prisma.mealSkip.deleteMany({ where: key })
    response.json({ skipped })
  } catch (error) {
    respondToError(response, error, 'Your meal choice could not be saved.')
  }
})

foodResidentRouter.put('/resident-portal/food/feedback', requireResident, requirePortalAccess, requireFoodPlan, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const propertyId = response.locals.propertyId as string
  const { meal, liked, comment: rawComment } = request.body as { meal?: unknown; liked?: unknown; comment?: unknown }
  if (!isMeal(meal) || typeof liked !== 'boolean') { response.status(400).json({ error: 'Choose thumbs up or down.' }); return }
  if (rawComment !== undefined && rawComment !== null && typeof rawComment !== 'string') { response.status(400).json({ error: 'Comment must be text.' }); return }
  const comment = rawComment?.trim() || null
  if (comment && comment.length > maxCommentLength) { response.status(400).json({ error: `Comments can be up to ${maxCommentLength} characters.` }); return }
  try {
    // Feedback is for today's meals only, once served; the date is the server's, not the client's.
    const now = propertyNow()
    const date = parseDateOnly(now.date) as Date
    const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } })
    if (!mealRules(now.date, toMealTimes(property)[meal], now).hasStarted) { response.status(409).json({ error: 'You can rate a meal once it has been served.' }); return }
    if (await prisma.mealSkip.count({ where: { residentId: userId, date, meal: mealTypes[meal] } })) { response.status(409).json({ error: 'You skipped this meal.' }); return }
    const saved = await prisma.mealFeedback.upsert({
      where: { residentId_date_meal: { residentId: userId, date, meal: mealTypes[meal] } },
      create: { residentId: userId, propertyId, date, meal: mealTypes[meal], liked, comment },
      update: { liked, comment },
    })
    response.json({ liked: saved.liked, comment: saved.comment })
  } catch (error) {
    respondToError(response, error, 'Your feedback could not be saved.')
  }
})

/** Owner routes for menus, headcounts, and feedback; must be mounted behind the super admin guard. */
export const foodAdminRouter = Router()

type MenuDayInput = { weekday?: unknown } & Partial<Record<Meal, unknown>>

// The week as seven rows, e.g. { weekday: 1, breakfast: 'Poha, tea', lunch: null, dinner: '…' }.
foodAdminRouter.get('/properties/:id/menu', async (request, response) => {
  const { id } = request.params as { id: string }
  try {
    const menu = await prisma.menuItem.findMany({ where: { propertyId: id } })
    response.json(Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, ...Object.fromEntries(meals.map((meal) => [meal, menu.find((item) => item.weekday === index + 1 && item.meal === mealTypes[meal])?.items ?? null])) })))
  } catch (error) {
    respondToError(response, error, 'The menu could not be loaded.')
  }
})

// Replaces the whole week at once, so the saved menu always matches what the owner sees in the form.
const weekdayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * The menu's changes as lines like "Monday lunch: veg biryani (was south indian veg meals)", in week
 * order, or null when nothing changed. A meal removed reads "no menu"; one newly set has no "(was …)".
 */
export function describeMenuChanges(before: Array<{ weekday: number; meal: MealType | string; items: string }>, after: Array<{ weekday: number; meal: MealType | string; items: string }>) {
  const key = (row: { weekday: number; meal: MealType | string }) => `${row.weekday}|${row.meal}`
  const old = new Map(before.map((row) => [key(row), row.items]))
  const next = new Map(after.map((row) => [key(row), row.items]))
  const lines: string[] = []
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    for (const meal of meals) {
      const k = `${weekday}|${mealTypes[meal]}`
      const was = old.get(k) ?? null
      const now = next.get(k) ?? null
      if (was === now) continue
      lines.push(`${weekdayNames[weekday]} ${meal}: ${now ?? 'no menu'}${was ? ` (was ${was})` : ''}`)
    }
  }
  return lines.length ? lines.join('\n') : null
}

foodAdminRouter.put('/properties/:id/menu', async (request, response) => {
  const { id } = request.params as { id: string }
  const days = (request.body as { days?: unknown }).days
  if (!Array.isArray(days)) { response.status(400).json({ error: 'The menu is missing.' }); return }
  const rows: Prisma.MenuItemCreateManyInput[] = []
  for (const day of days as MenuDayInput[]) {
    if (typeof day.weekday !== 'number' || !Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7) { response.status(400).json({ error: 'Each menu day needs a weekday from 1 to 7.' }); return }
    for (const meal of meals) {
      const items = day[meal]
      if (items === undefined || items === null) continue
      if (typeof items !== 'string') { response.status(400).json({ error: 'Menu items must be text.' }); return }
      if (items.trim().length > maxItemsLength) { response.status(400).json({ error: `Each meal can be up to ${maxItemsLength} characters.` }); return }
      if (items.trim()) rows.push({ propertyId: id, weekday: day.weekday, meal: mealTypes[meal], items: items.trim() })
    }
  }
  try {
    await prisma.property.findUniqueOrThrow({ where: { id }, select: { id: true } })
    // Residents are told what changed (each day and meal, old and new), and only when something did.
    const before = await prisma.menuItem.findMany({ where: { propertyId: id }, select: { weekday: true, meal: true, items: true } })
    const changes = describeMenuChanges(before, rows)
    await prisma.$transaction([prisma.menuItem.deleteMany({ where: { propertyId: id } }), prisma.menuItem.createMany({ data: rows }), ...(changes ? [prisma.property.update({ where: { id }, data: { menuUpdatedAt: new Date(), menuChanges: changes } })] : [])])
    response.json({ saved: rows.length })
  } catch (error) {
    respondToError(response, error, 'The menu could not be saved.')
  }
})

// Headcounts for today and tomorrow (active residents on a food plan, minus skips) and the last week's feedback.
foodAdminRouter.get('/properties/:id/food-summary', async (request, response) => {
  const { id } = request.params as { id: string }
  try {
    const today = parseDateOnly(propertyNow().date) as Date
    const tomorrow = addDays(today, 1)
    const [residents, skips, feedback] = await Promise.all([
      prisma.resident.count({ where: { active: true, foodOpted: true, room: { propertyId: id } } }),
      prisma.mealSkip.groupBy({ by: ['date', 'meal'], where: { date: { in: [today, tomorrow] }, resident: { active: true, foodOpted: true, room: { propertyId: id } } }, _count: { _all: true } }),
      prisma.mealFeedback.findMany({ where: { propertyId: id, date: { gt: addDays(today, -feedbackDays) } }, orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }], take: 100, select: { id: true, date: true, meal: true, liked: true, comment: true, resident: { select: { name: true } } } }),
    ])
    const headcounts = [today, tomorrow].map((date) => ({
      date: isoDate(date),
      meals: meals.map((meal) => {
        const skipping = skips.find((group) => isoDate(group.date) === isoDate(date) && group.meal === mealTypes[meal])?._count._all ?? 0
        return { meal, eating: Math.max(residents - skipping, 0), skipping }
      }),
    }))
    response.json({
      residents,
      headcounts,
      feedback: feedback.map((item) => ({ id: item.id, date: isoDate(item.date), meal: mealOf(item.meal), liked: item.liked, comment: item.comment, residentName: item.resident.name })),
    })
  } catch (error) {
    respondToError(response, error, 'The food summary could not be loaded.')
  }
})
