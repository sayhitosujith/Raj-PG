import { MealType, Prisma, UserRole } from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { requireRole, type AuthContext } from './auth.js'
import { parseDateOnly, propertyNow } from './dates.js'
import { prisma } from './db.js'
import { mealColumnsSelect, meals, toMealTimes } from './meals.js'
import { renderFeedbackPdf, renderHeadcountPdf, renderResidentsPdf, type ReportHeader } from './foodReports.js'
import { requirePortalAccess } from './residentPortal.js'
import { getSettings } from './settings.js'

/**
 * Food menu: a repeating weekly menu per property, residents answering eat or skip for every meal by
 * 9 pm the day before (so the owner sees firm headcounts), and thumbs up/down feedback on meals that
 * have been served. All time rules are decided here in property-local time; the UIs only show what is allowed.
 */
type Meal = (typeof meals)[number]
export const mealTypes: Record<Meal, MealType> = { breakfast: MealType.BREAKFAST, lunch: MealType.LUNCH, dinner: MealType.DINNER }
export const mealOf = (type: MealType) => meals.find((meal) => mealTypes[meal] === type) as Meal
export const isMeal = (value: unknown): value is Meal => typeof value === 'string' && (meals as readonly string[]).includes(value)

export const daysShown = 7
const maxItemsLength = 200
const maxCommentLength = 300
const feedbackDays = 7
const msPerDay = 24 * 60 * 60 * 1000

/** ISO weekday (1 = Monday … 7 = Sunday) of a date-only value stored at UTC midnight. */
const weekdayOf = (date: Date) => ((date.getUTCDay() + 6) % 7) + 1
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * msPerDay)
export const isoDate = (date: Date) => date.toISOString().slice(0, 10)
const toMinutes = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }

type MealWindow = { from: string; to: string }
type Now = { date: string; minutes: number }

/** Choices for a day's meals close at this time (property-local) on the day before. */
const choiceCutoffMinutes = 21 * 60
/**
 * The first date on which a meal with no answer counts as not eating. Earlier dates keep the old rule
 * (eating unless skipped), so residents were not marked absent for days they could no longer answer for
 * when this rule went live.
 */
const choicesRequiredFrom = '2026-10-15'

// A day's choices can change until 9 pm the day before; a meal can be rated once it has started (today only).
export function mealRules(date: string, window: MealWindow, now: Now) {
  const dayBefore = isoDate(addDays(parseDateOnly(date) as Date, -1))
  const canChange = now.date < dayBefore || (now.date === dayBefore && now.minutes < choiceCutoffMinutes)
  const started = date < now.date || (date === now.date && now.minutes >= toMinutes(window.from))
  return { canChange, hasStarted: started, isToday: date === now.date }
}

/** Whether a resident eats a meal: their answer, or with none, not eating (eating before the rule began). */
export const isEating = (date: string, answer: boolean | undefined) => answer ?? date < choicesRequiredFrom

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Property was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Resident routes; mounted before the super admin guard, so each checks the resident role itself. */
export const foodResidentRouter = Router()
export const requireResident = requireRole(UserRole.RESIDENT)

/** A property's meal times, reading only those columns (not the whole row with its photo). */
export async function mealTimesOf(propertyId: string) {
  return toMealTimes(await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: mealColumnsSelect }))
}

// Residents without a food plan have no menu to skip or rate.
export async function requireFoodPlan(_request: Request, response: Response, next: NextFunction) {
  const { userId } = response.locals.auth as AuthContext
  const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { foodOpted: true } })
  if (!resident?.foodOpted) { response.status(403).json({ error: 'Your plan does not include food.', code: 'NO_FOOD_PLAN' }); return }
  next()
}

/**
 * The next seven days starting today, each meal with its menu, timing, the resident's answer and what
 * they may do; plus `answerDue`, tomorrow's date while any of its meals still needs an answer before
 * the 9 pm cutoff (the portal asks for it and will not let the resident carry on until they answer).
 */
foodResidentRouter.get('/resident-portal/food', requireResident, requirePortalAccess, requireFoodPlan, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const propertyId = response.locals.propertyId as string
  try {
    const now = propertyNow()
    const today = parseDateOnly(now.date) as Date
    const until = addDays(today, daysShown)
    const [times, menu, choices, feedback, lateRequests] = await Promise.all([
      mealTimesOf(propertyId),
      prisma.menuItem.findMany({ where: { propertyId } }),
      prisma.mealChoice.findMany({ where: { residentId: userId, date: { gte: today, lt: until } } }),
      prisma.mealFeedback.findMany({ where: { residentId: userId, date: today } }),
      prisma.lateMealRequest.findMany({ where: { residentId: userId, date: { gte: today, lt: until } }, select: { date: true, meal: true, status: true, staffNote: true } }),
    ])
    const days = Array.from({ length: daysShown }, (_, index) => {
      const date = addDays(today, index)
      const key = isoDate(date)
      const weekday = weekdayOf(date)
      return {
        date: key,
        weekday,
        meals: meals.map((meal) => {
          const answer = choices.find((choice) => isoDate(choice.date) === key && choice.meal === mealTypes[meal])?.eating
          const eating = isEating(key, answer)
          const rules = mealRules(key, times[meal], now)
          const own = feedback.find((item) => isoDate(item.date) === key && item.meal === mealTypes[meal])
          const lateRequest = lateRequests.find((item) => isoDate(item.date) === key && item.meal === mealTypes[meal])
          return {
            meal,
            ...times[meal],
            items: menu.find((item) => item.weekday === weekday && item.meal === mealTypes[meal])?.items ?? null,
            answer: answer ?? null,
            eating,
            canChange: rules.canChange,
            canRate: rules.isToday && rules.hasStarted && eating,
            feedback: own ? { liked: own.liked, comment: own.comment } : null,
            // Past the cutoff, not eating and not yet started: the resident may ask staff for it (lateMeals.ts).
            canRequestLate: !rules.canChange && !rules.hasStarted && !eating && !lateRequest,
            lateRequest: lateRequest ? { status: lateRequest.status, staffNote: lateRequest.staffNote } : null,
          }
        }),
      }
    })
    const tomorrow = days[1]
    const answerDue = tomorrow.date >= choicesRequiredFrom && tomorrow.meals.some((meal) => meal.canChange && meal.answer === null) ? tomorrow.date : null
    response.json({ days, answerDue })
  } catch (error) {
    respondToError(response, error, 'The food menu could not be loaded.')
  }
})

// Eat or skip for one or more meals of one day, e.g. { date: '2026-10-15', choices: { breakfast: true, lunch: false, dinner: true } }.
foodResidentRouter.put('/resident-portal/food/choices', requireResident, requirePortalAccess, requireFoodPlan, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { date: rawDate, choices } = request.body as { date?: string; choices?: unknown }
  const date = parseDateOnly(rawDate)
  const entries = choices && typeof choices === 'object' ? Object.entries(choices) : []
  if (!date || !entries.length || entries.some(([meal, eating]) => !isMeal(meal) || typeof eating !== 'boolean')) { response.status(400).json({ error: 'Choose eat or skip for each meal.' }); return }
  try {
    const now = propertyNow()
    const today = parseDateOnly(now.date) as Date
    if (date < today || date >= addDays(today, daysShown)) { response.status(400).json({ error: `Meals can be chosen up to ${daysShown} days ahead.` }); return }
    const times = await mealTimesOf(response.locals.propertyId as string)
    if (entries.some(([meal]) => !mealRules(isoDate(date), times[meal as Meal], now).canChange)) { response.status(409).json({ error: 'Meal choices close at 9 pm the day before, so that day can no longer be changed.' }); return }
    await prisma.$transaction(entries.map(([meal, eating]) => {
      const key = { residentId: userId, date, meal: mealTypes[meal as Meal] }
      return prisma.mealChoice.upsert({ where: { residentId_date_meal: key }, create: { ...key, eating: eating as boolean }, update: { eating: eating as boolean } })
    }))
    response.json({ saved: entries.length })
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
    const [times, choice] = await Promise.all([mealTimesOf(propertyId), prisma.mealChoice.findUnique({ where: { residentId_date_meal: { residentId: userId, date, meal: mealTypes[meal] } }, select: { eating: true } })])
    if (!mealRules(now.date, times[meal], now).hasStarted) { response.status(409).json({ error: 'You can rate a meal once it has been served.' }); return }
    if (!isEating(now.date, choice?.eating)) { response.status(409).json({ error: 'You were not eating this meal.' }); return }
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

/**
 * Headcounts for today and tomorrow from active residents on a food plan: who answered eating, who
 * skips, and who has not answered (counted as not eating; their names, so the owner can chase them),
 * plus the last week's feedback. Shared by the Kitchen page and its PDF exports, so they always agree.
 */
/** Active residents of a property who are on its food plan: the people every headcount counts. */
const onFoodPlanAt = (propertyId: string) => ({ active: true, foodOpted: true, room: { propertyId } })

async function loadFoodSummary(id: string) {
  const today = parseDateOnly(propertyNow().date) as Date
  const tomorrow = addDays(today, 1)
  const onFoodPlan = onFoodPlanAt(id)
  const [residents, choices, feedback] = await Promise.all([
    prisma.resident.findMany({ where: onFoodPlan, select: { id: true, name: true, phone: true, diet: true, room: { select: { number: true } } }, orderBy: { name: 'asc' } }),
    prisma.mealChoice.findMany({ where: { date: { in: [today, tomorrow] }, resident: onFoodPlan }, select: { residentId: true, date: true, meal: true, eating: true } }),
    prisma.mealFeedback.findMany({ where: { propertyId: id, date: { gt: addDays(today, -feedbackDays) } }, orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }], take: 100, select: { id: true, date: true, meal: true, liked: true, comment: true, resident: { select: { name: true } } } }),
  ])
  const answerOn = (key: string, residentId: string, meal: Meal) => choices.find((choice) => choice.residentId === residentId && isoDate(choice.date) === key && choice.meal === mealTypes[meal])?.eating
  const headcounts = [today, tomorrow].map((date) => {
    const key = isoDate(date)
    const answerOf = (residentId: string, meal: Meal) => answerOn(key, residentId, meal)
    return {
      date: key,
      meals: meals.map((meal) => {
        const answers = residents.map((resident) => answerOf(resident.id, meal))
        const eaters = residents.filter((_, i) => isEating(key, answers[i]))
        const eating = eaters.length
        const skipping = answers.filter((answer) => answer === false).length
        // How the eaters split, so the kitchen knows how much of each to cook; the rest are Not set.
        const veg = eaters.filter((resident) => resident.diet === 'VEG').length
        const nonVeg = eaters.filter((resident) => resident.diet === 'NON_VEG').length
        return { meal, eating, veg, nonVeg, skipping, noAnswer: residents.length - eating - skipping }
      }),
      // Only once a missing answer means "not eating"; before that it simply meant eating.
      notAnswered: key >= choicesRequiredFrom ? residents.filter((resident) => meals.some((meal) => answerOf(resident.id, meal) === undefined)).map((resident) => resident.name) : [],
    }
  })
  // Each resident's answer per meal on a day, by the same rule as the headcount: EATING includes a missing
  // answer while that still meant eating (before choicesRequiredFrom), so the row and the totals agree.
  const statusOn = (date: Date, residentId: string) => {
    const key = isoDate(date)
    return Object.fromEntries(meals.map((meal) => {
      const answer = answerOn(key, residentId, meal)
      return [meal, isEating(key, answer) ? 'EATING' : answer === false ? 'SKIPPING' : 'NO_ANSWER']
    })) as Record<Meal, 'EATING' | 'SKIPPING' | 'NO_ANSWER'>
  }
  return {
    residents: residents.length,
    // Who the headcount is, with what the kitchen needs to reach or plan for them, in room order:
    // the Kitchen page's "Residents on food" and the headcount PDF's list.
    residentList: residents
      .map((resident) => ({ id: resident.id, name: resident.name, phone: resident.phone, diet: resident.diet, room: resident.room?.number ?? '', today: statusOn(today, resident.id), tomorrow: statusOn(tomorrow, resident.id) }))
      .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }) || a.name.localeCompare(b.name)),
    headcounts,
    feedback: feedback.map((item) => ({ id: item.id, date: isoDate(item.date), meal: mealOf(item.meal), liked: item.liked, comment: item.comment, residentName: item.resident.name })),
  }
}

/** The Kitchen page's summary, as shaped by loadFoodSummary; also what the PDF exports print. */
export type FoodSummaryData = Awaited<ReturnType<typeof loadFoodSummary>>

foodAdminRouter.get('/properties/:id/food-summary', async (request, response) => {
  const { id } = request.params as { id: string }
  try {
    response.json(await loadFoodSummary(id))
  } catch (error) {
    respondToError(response, error, 'The food summary could not be loaded.')
  }
})

// The Kitchen page's Headcount, Feedback and Residents on food panels as PDFs, for the kitchen wall or the cook's phone.
// Same data as the page (loadFoodSummary), drawn the way the rent receipts are (foodReports.ts).
const pdfReports = {
  headcount: renderHeadcountPdf,
  feedback: (summary: FoodSummaryData, header: ReportHeader) => renderFeedbackPdf(summary, header, feedbackDays),
  residents: renderResidentsPdf,
}
for (const report of Object.keys(pdfReports) as Array<keyof typeof pdfReports>) {
  foodAdminRouter.get(`/properties/:id/food-summary/${report}.pdf`, async (request, response) => {
    const { id } = request.params as { id: string }
    try {
      const property = await prisma.property.findUnique({ where: { id }, select: { name: true } })
      if (!property) { response.status(404).json({ error: 'Property was not found.' }); return }
      const [summary, settings] = await Promise.all([loadFoodSummary(id), getSettings()])
      const header = { business: settings.businessName, property: property.name, generatedAt: new Date() }
      const pdf = await pdfReports[report](summary, header)
      const fileName = `${report}-${property.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'property'}-${propertyNow().date}.pdf`
      response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"`, 'Cache-Control': 'private, no-store' }).send(pdf)
    } catch (error) {
      respondToError(response, error, `The ${report} PDF could not be created.`)
    }
  })
}
