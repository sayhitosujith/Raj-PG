import { Router, type Request, type Response } from 'express'
import { istMonthKey, monthRange, propertyNow } from './dates.js'
import { prisma } from './db.js'
import { expenseCategories, otherIncomePayments } from './finance.js'
import { maintenanceCategories } from './maintenance.js'
import { bedCounts, roomBedsSelect } from './occupancy.js'
import { activeConcessions, owedForMonth, rentStatus } from './rent.js'
import { getSettings, rentRulesOf } from './settings.js'

/**
 * The super admins' Reports page: rent & dues, income vs expenses, occupancy, and maintenance &
 * housekeeping, each month by month over the last 3, 6 or 12 months, for all properties or one.
 * Read-only. Every figure comes from the same rules as the screens that manage it (rentStatus for
 * dues, the finance summary's income rules, bedCounts for beds), so a report never disagrees with
 * them. Owner-only: staffGuard refuses /reports for receptionists.
 */
export const reportsRouter = Router()

const periodChoices = [3, 6, 12] as const
const defaultPeriod = 6

/** What every report is about: its months (oldest first) and the property filter (null = all). */
type ReportScope = { months: string[]; propertyId: string | null; start: Date; end: Date; istStart: Date; istEnd: Date }

/** The `count` month keys ending with `last`, oldest first. */
function monthsEnding(last: string, count: number) {
  const [year, month] = last.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, month - count + index, 1)).toISOString().slice(0, 7))
}

function reportScope(request: Request): ReportScope {
  const requested = Number(request.query.months)
  const count = (periodChoices as readonly number[]).includes(requested) ? requested : defaultPeriod
  const months = monthsEnding(propertyNow().date.slice(0, 7), count)
  const first = monthRange(months[0])
  const last = monthRange(months[months.length - 1])
  const propertyId = typeof request.query.propertyId === 'string' && request.query.propertyId ? request.query.propertyId : null
  return { months, propertyId, start: first.start, end: last.end, istStart: first.istStart, istEnd: last.istEnd }
}

const zeroByMonth = (months: string[]) => Object.fromEntries(months.map((month) => [month, 0])) as Record<string, number>
const add = (totals: Record<string, number>, month: string, amount: number) => { if (month in totals) totals[month] += amount }
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Where a resident lives (or lived), for attributing their rent, move-ins and requests to a property. */
const residentPlaceSelect = { movedOutFrom: true, room: { select: { propertyId: true, number: true } } } as const
type ResidentPlace = { movedOutFrom: string | null; room: { propertyId: string; number: string } | null }

/**
 * Resolves a resident's property. Moving out clears the room, keeping only movedOutFrom
 * ("<property name> · Room <n>", see exits.ts), so a moved-out resident is matched by property name;
 * null when that name no longer matches a property (renamed or deleted).
 */
async function propertyDirectory() {
  const properties = await prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const nameOf = new Map(properties.map((property) => [property.id, property.name]))
  const idByName = new Map([...properties].reverse().map((property) => [property.name, property.id]))
  const propertyOf = (resident: ResidentPlace) => resident.room?.propertyId ?? (resident.movedOutFrom ? idByName.get(resident.movedOutFrom.split(' · Room ')[0]) ?? null : null)
  return { nameOf, propertyOf }
}

const inScope = (scope: ReportScope, propertyId: string | null) => !scope.propertyId || propertyId === scope.propertyId

/** Wraps a report builder as a route: scope from the query, JSON out, one error message for all. */
function reportRoute(build: (scope: ReportScope) => Promise<unknown>) {
  return async (request: Request, response: Response) => {
    try {
      response.json(await build(reportScope(request)))
    } catch (error) {
      console.error('Report failed:', error)
      response.status(503).json({ error: 'The report could not be loaded.' })
    }
  }
}

/**
 * Rent & dues: per month, the rent paid for that month and what it still owes (late fees included),
 * which together are what the month was expected to bring in; plus everyone who owes rent now. "Still
 * owes" follows current residents, as the rent screens do; a moved-out resident's dues are settled at
 * move-out (exits.ts), so they are not counted here.
 */
reportsRouter.get('/reports/rent', reportRoute(async (scope) => {
  const [directory, settings, residents] = await Promise.all([
    propertyDirectory(),
    getSettings(),
    prisma.resident.findMany({
      where: { OR: [{ active: true, monthlyRent: { not: null } }, { rentPayments: { some: { month: { in: scope.months } } } }] },
      select: { id: true, name: true, active: true, monthlyRent: true, rentTrackedFrom: true, joinedAt: true, ...residentPlaceSelect, rentPayments: { select: { month: true, amount: true } }, ...activeConcessions },
    }),
  ])
  const rules = rentRulesOf(settings)
  const collected = zeroByMonth(scope.months)
  const outstanding = zeroByMonth(scope.months)
  const dues = []
  for (const resident of residents) {
    const propertyId = directory.propertyOf(resident)
    if (!inScope(scope, propertyId)) continue
    for (const payment of resident.rentPayments) add(collected, payment.month, payment.amount)
    const status = rentStatus(resident, resident.rentPayments.map((payment) => payment.month), rules)
    for (const month of scope.months) outstanding[month] += owedForMonth(status, month)
    if (status.amountDue > 0) dues.push({ residentId: resident.id, name: resident.name, property: propertyId ? directory.nameOf.get(propertyId) ?? '' : '', room: resident.room?.number ?? '', monthsOwed: status.outstandingMonths, overdueMonths: status.overdueMonths.length, amountDue: status.amountDue })
  }
  const months = scope.months.map((month) => ({ month, collected: collected[month], outstanding: outstanding[month], expected: collected[month] + outstanding[month] }))
  const totals = { collected: sum(months.map((row) => row.collected)), outstanding: sum(months.map((row) => row.outstanding)), expected: sum(months.map((row) => row.expected)), owedNow: sum(dues.map((due) => due.amountDue)) }
  return { months, totals, dues: dues.sort((a, b) => b.amountDue - a.amountDue) }
}))

/**
 * Income vs expenses, by the month money moved (as the Payments page counts it): rent received,
 * other income, expenses and the profit. With a property filter, expenses not linked to a property
 * cannot be attributed, so they are left out and their total is returned for the page to say so.
 */
reportsRouter.get('/reports/finance', reportRoute(async (scope) => {
  const [directory, rentPayments, otherPayments, expenses] = await Promise.all([
    propertyDirectory(),
    prisma.rentPayment.findMany({ where: { paidAt: { gte: scope.istStart, lt: scope.istEnd } }, select: { amount: true, paidAt: true, resident: { select: residentPlaceSelect } } }),
    otherIncomePayments({ istStart: scope.istStart, istEnd: scope.istEnd }),
    prisma.expense.findMany({ where: { date: { gte: scope.start, lt: scope.end } }, select: { amount: true, category: true, date: true, propertyId: true } }),
  ])
  const rent = zeroByMonth(scope.months)
  const other = zeroByMonth(scope.months)
  const spent = zeroByMonth(scope.months)
  const byCategory = Object.fromEntries(expenseCategories.map((category) => [category, 0])) as Record<string, number>
  let unassignedExpenses = 0
  for (const payment of rentPayments) if (inScope(scope, directory.propertyOf(payment.resident))) add(rent, istMonthKey(payment.paidAt), payment.amount)
  for (const payment of otherPayments) if (inScope(scope, payment.propertyId)) add(other, istMonthKey(payment.createdAt), payment.amount)
  for (const expense of expenses) {
    if (!inScope(scope, expense.propertyId)) { if (!expense.propertyId) unassignedExpenses += expense.amount; continue }
    // Expense.date is a calendar day stored at UTC midnight, so its UTC month is its own month.
    add(spent, expense.date.toISOString().slice(0, 7), expense.amount)
    byCategory[expense.category] = (byCategory[expense.category] ?? 0) + expense.amount
  }
  const months = scope.months.map((month) => {
    const income = rent[month] + other[month]
    return { month, rentReceived: rent[month], otherIncome: other[month], income, expenses: spent[month], profit: income - spent[month] }
  })
  const income = sum(months.map((row) => row.income))
  const totalExpenses = sum(months.map((row) => row.expenses))
  return { months, totals: { income, expenses: totalExpenses, profit: income - totalExpenses }, expensesByCategory: byCategory, unassignedExpenses }
}))

/**
 * Occupancy: beds taken and free per property right now (bedCounts, as the dashboard shows it), the
 * defined rooms by sharing type, and move-ins and move-outs per month. Past occupancy is not stored,
 * so the month-by-month view is the movement, not a history of the percentage.
 */
reportsRouter.get('/reports/occupancy', reportRoute(async (scope) => {
  const [directory, properties, joined, left] = await Promise.all([
    propertyDirectory(),
    prisma.property.findMany({ where: scope.propertyId ? { id: scope.propertyId } : {}, orderBy: { name: 'asc' }, select: { id: true, name: true, totalRooms: true, rooms: { select: roomBedsSelect } } }),
    prisma.resident.findMany({ where: { joinedAt: { gte: scope.start, lt: scope.end } }, select: { joinedAt: true, ...residentPlaceSelect } }),
    prisma.resident.findMany({ where: { movedOutAt: { gte: scope.istStart, lt: scope.istEnd } }, select: { movedOutAt: true, ...residentPlaceSelect } }),
  ])
  const byProperty = properties.map((property) => {
    const { taken, total } = bedCounts(property)
    return { propertyId: property.id, name: property.name, beds: total, taken, free: Math.max(0, total - taken), occupancy: total ? Math.min(100, Math.round((taken / total) * 100)) : 0 }
  })
  const sharing = new Map<number, { beds: number; rooms: number; totalBeds: number; taken: number }>()
  for (const room of properties.flatMap((property) => property.rooms)) {
    const row = sharing.get(room.beds) ?? { beds: room.beds, rooms: 0, totalBeds: 0, taken: 0 }
    row.rooms += 1
    row.totalBeds += room.beds
    row.taken += room._count.residents
    sharing.set(room.beds, row)
  }
  const moveIns = zeroByMonth(scope.months)
  const moveOuts = zeroByMonth(scope.months)
  // joinedAt is a calendar day (UTC midnight); movedOutAt is an instant, so it is grouped in IST.
  for (const resident of joined) if (inScope(scope, directory.propertyOf(resident))) add(moveIns, resident.joinedAt.toISOString().slice(0, 7), 1)
  for (const resident of left) if (resident.movedOutAt && inScope(scope, directory.propertyOf(resident))) add(moveOuts, istMonthKey(resident.movedOutAt), 1)
  const beds = sum(byProperty.map((row) => row.beds))
  const taken = sum(byProperty.map((row) => row.taken))
  return {
    totals: { beds, taken, free: Math.max(0, beds - taken), occupancy: beds ? Math.min(100, Math.round((taken / beds) * 100)) : 0 },
    byProperty,
    bySharing: [...sharing.values()].sort((a, b) => a.beds - b.beds),
    months: scope.months.map((month) => ({ month, moveIns: moveIns[month], moveOuts: moveOuts[month] })),
  }
}))

/**
 * Residents by country: everyone living at the properties now, grouped by nationality (ISO alpha-2,
 * as stored), largest group first, with each resident's name, property and room for the drill-down.
 * A snapshot of today, so the period filter does not apply; the property filter does.
 */
reportsRouter.get('/reports/countries', reportRoute(async (scope) => {
  const [directory, residents] = await Promise.all([
    propertyDirectory(),
    prisma.resident.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, nationality: true, ...residentPlaceSelect } }),
  ])
  const byCountry = new Map<string, { id: string; name: string; property: string; room: string }[]>()
  for (const resident of residents) {
    const propertyId = directory.propertyOf(resident)
    if (!inScope(scope, propertyId)) continue
    const list = byCountry.get(resident.nationality) ?? []
    list.push({ id: resident.id, name: resident.name, property: propertyId ? directory.nameOf.get(propertyId) ?? '' : '', room: resident.room?.number ?? '' })
    byCountry.set(resident.nationality, list)
  }
  const countries = [...byCountry.entries()].map(([code, list]) => ({ code, residents: list })).sort((a, b) => b.residents.length - a.residents.length || a.code.localeCompare(b.code))
  return { total: sum(countries.map((country) => country.residents.length)), countries }
}))

const dayMs = 24 * 60 * 60 * 1000

/**
 * Maintenance and housekeeping: per month, repairs raised and resolved and cleaning requests made,
 * done and cancelled; what is open right now; the average days a repair took to resolve; and repairs
 * by category. Requests from before the period still count as open if they are.
 */
reportsRouter.get('/reports/requests', reportRoute(async (scope) => {
  const inPeriod = { gte: scope.istStart, lt: scope.istEnd }
  const [directory, repairs, cleaning] = await Promise.all([
    propertyDirectory(),
    prisma.maintenanceRequest.findMany({ where: { ...(scope.propertyId ? { propertyId: scope.propertyId } : {}), OR: [{ createdAt: inPeriod }, { resolvedAt: inPeriod }, { status: { not: 'resolved' } }] }, select: { status: true, category: true, createdAt: true, resolvedAt: true } }),
    prisma.housekeepingRequest.findMany({ where: { OR: [{ createdAt: inPeriod }, { status: { in: ['REQUESTED', 'SCHEDULED'] } }] }, select: { status: true, createdAt: true, resident: { select: residentPlaceSelect } } }),
  ])
  const raised = zeroByMonth(scope.months)
  const resolved = zeroByMonth(scope.months)
  const resolveDays: number[] = []
  const byCategory = Object.fromEntries(maintenanceCategories.map((category) => [category, { raised: 0, open: 0 }])) as Record<string, { raised: number; open: number }>
  for (const repair of repairs) {
    const category = byCategory[repair.category] ?? byCategory.other
    const createdMonth = istMonthKey(repair.createdAt)
    if (createdMonth in raised) { raised[createdMonth] += 1; category.raised += 1 }
    if (repair.status !== 'resolved') category.open += 1
    if (repair.resolvedAt && istMonthKey(repair.resolvedAt) in resolved) {
      resolved[istMonthKey(repair.resolvedAt)] += 1
      resolveDays.push((repair.resolvedAt.getTime() - repair.createdAt.getTime()) / dayMs)
    }
  }
  const requested = zeroByMonth(scope.months)
  const done = zeroByMonth(scope.months)
  const cancelled = zeroByMonth(scope.months)
  let cleaningOpen = 0
  for (const request of cleaning) {
    if (!inScope(scope, directory.propertyOf(request.resident))) continue
    if (request.status === 'REQUESTED' || request.status === 'SCHEDULED') cleaningOpen += 1
    const month = istMonthKey(request.createdAt)
    add(requested, month, 1)
    if (request.status === 'DONE') add(done, month, 1)
    if (request.status === 'CANCELLED') add(cancelled, month, 1)
  }
  return {
    maintenance: {
      months: scope.months.map((month) => ({ month, raised: raised[month], resolved: resolved[month] })),
      open: repairs.filter((repair) => repair.status !== 'resolved').length,
      averageDaysToResolve: resolveDays.length ? Math.round((sum(resolveDays) / resolveDays.length) * 10) / 10 : null,
      byCategory: maintenanceCategories.map((category) => ({ category, ...byCategory[category] })),
    },
    housekeeping: {
      months: scope.months.map((month) => ({ month, requested: requested[month], done: done[month], cancelled: cancelled[month] })),
      open: cleaningOpen,
    },
  }
}))
