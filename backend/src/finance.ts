import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { parseDateOnly, propertyNow, propertyUtcOffsetMs } from './dates.js'
import { prisma } from './db.js'
import { rentStatus } from './rent.js'
import { getSettings, rentRulesOf } from './settings.js'

/**
 * Money in and out for the owner's Payments page: expenses they record, and a monthly summary of
 * income, expenses and profit/loss. Income is counted once: paid rent months come from the rent
 * ledger (RentPayment), and only Payments entries that are NOT rent (no claimed months, no rent QR)
 * are added as "other income", since rent reports and rent QR codes also create a RentPayment.
 */
export const expenseCategories = ['salaries', 'utilities', 'food', 'maintenance', 'other'] as const
type ExpenseCategory = (typeof expenseCategories)[number]

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const maxAmount = 1_00_00_000

const monthAfter = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/** A month's calendar-day range (for date-only columns) and its IST instant range (for timestamps). */
function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00Z`)
  const end = new Date(`${monthAfter(month)}-01T00:00:00Z`)
  return { start, end, istStart: new Date(start.getTime() - propertyUtcOffsetMs), istEnd: new Date(end.getTime() - propertyUtcOffsetMs) }
}

/** Paid Payments entries that are not rent, optionally within an IST instant range. */
async function otherIncome(range?: { istStart: Date; istEnd: Date }) {
  const payments = await prisma.payment.findMany({
    where: { status: 'paid', rentMonths: { equals: Prisma.DbNull }, ...(range ? { createdAt: { gte: range.istStart, lt: range.istEnd } } : {}) },
    select: { amount: true, razorpayQrId: true },
  })
  // A resident's rent QR has a RentOrder under the same id; that money is already in the rent ledger.
  const qrIds = payments.flatMap((payment) => payment.razorpayQrId ? [payment.razorpayQrId] : [])
  const rentQrIds = new Set(qrIds.length ? (await prisma.rentOrder.findMany({ where: { razorpayOrderId: { in: qrIds } }, select: { razorpayOrderId: true } })).map((order) => order.razorpayOrderId) : [])
  return payments.filter((payment) => !payment.razorpayQrId || !rentQrIds.has(payment.razorpayQrId)).reduce((sum, payment) => sum + payment.amount, 0)
}

/** Rent still owed for `month`, from each resident's rent status (so it matches the rent screens). */
async function rentOutstanding(month: string) {
  const rules = rentRulesOf(await getSettings())
  const residents = await prisma.resident.findMany({ where: { active: true, monthlyRent: { not: null } }, select: { monthlyRent: true, rentTrackedFrom: true, joinedAt: true, active: true, rentPayments: { select: { month: true } } } })
  return residents.reduce((sum, resident) => {
    const status = rentStatus(resident, resident.rentPayments.map((payment) => payment.month), rules)
    return status.outstandingMonths.includes(month) ? sum + (status.monthlyRent ?? 0) + (status.overdueMonths.includes(month) ? status.lateFee : 0) : sum
  }, 0)
}

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Expense was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Owner routes for expenses and the finance summary; must be mounted behind the super admin guard. */
export const financeAdminRouter = Router()

// The month's figures, with all-time totals for "income till now". ?month=YYYY-MM, default this month (IST).
financeAdminRouter.get('/finance/summary', async (request, response) => {
  const month = typeof request.query.month === 'string' && monthPattern.test(request.query.month) ? request.query.month : propertyNow().date.slice(0, 7)
  const range = monthRange(month)
  try {
    const [rentThisMonth, rentAllTime, expenseRows, expensesAllTime, otherThisMonth, otherAllTime, outstanding] = await Promise.all([
      prisma.rentPayment.aggregate({ _sum: { amount: true }, where: { month } }),
      prisma.rentPayment.aggregate({ _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['category'], _sum: { amount: true }, where: { date: { gte: range.start, lt: range.end } } }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      otherIncome(range),
      otherIncome(),
      rentOutstanding(month),
    ])
    const rentCollected = rentThisMonth._sum.amount ?? 0
    const expensesByCategory = Object.fromEntries(expenseCategories.map((category) => [category, expenseRows.find((row) => row.category === category)?._sum.amount ?? 0])) as Record<ExpenseCategory, number>
    const expenses = Object.values(expensesByCategory).reduce((sum, amount) => sum + amount, 0)
    const income = rentCollected + otherThisMonth
    const totalIncome = (rentAllTime._sum.amount ?? 0) + otherAllTime
    const totalExpenses = expensesAllTime._sum.amount ?? 0
    response.json({
      month,
      rentCollected,
      rentExpected: rentCollected + outstanding,
      otherIncome: otherThisMonth,
      income,
      expenses,
      expensesByCategory,
      profit: income - expenses,
      totals: { income: totalIncome, expenses: totalExpenses, profit: totalIncome - totalExpenses },
    })
  } catch (error) { respondToError(response, error, 'The finance summary could not be loaded.') }
})

financeAdminRouter.get('/expenses', async (request, response) => {
  const month = typeof request.query.month === 'string' && monthPattern.test(request.query.month) ? request.query.month : propertyNow().date.slice(0, 7)
  const range = monthRange(month)
  try {
    const expenses = await prisma.expense.findMany({ where: { date: { gte: range.start, lt: range.end } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: { property: { select: { name: true } } } })
    response.json(expenses.map(({ property, ...expense }) => ({ ...expense, property: property?.name ?? null })))
  } catch (error) { respondToError(response, error, 'Expenses could not be loaded.') }
})

financeAdminRouter.post('/expenses', async (request, response) => {
  const { category, amount, date, note, propertyId } = request.body as { category?: unknown; amount?: unknown; date?: unknown; note?: unknown; propertyId?: unknown }
  if (typeof category !== 'string' || !(expenseCategories as readonly string[]).includes(category)) { response.status(400).json({ error: 'Choose a category.' }); return }
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > maxAmount) { response.status(400).json({ error: 'Amount must be a whole number of rupees above zero.' }); return }
  const day = parseDateOnly(typeof date === 'string' ? date : undefined)
  if (!day) { response.status(400).json({ error: 'Enter the date of the expense.' }); return }
  const text = typeof note === 'string' ? note.trim() : ''
  if (text.length > 200) { response.status(400).json({ error: 'Keep the note under 200 characters.' }); return }
  const property = typeof propertyId === 'string' && propertyId ? propertyId : null
  try {
    const expense = await prisma.expense.create({ data: { category, amount, date: day, note: text, propertyId: property }, include: { property: { select: { name: true } } } })
    const { property: linked, ...fields } = expense
    response.status(201).json({ ...fields, property: linked?.name ?? null })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { response.status(400).json({ error: 'Choose a valid property.' }); return }
    respondToError(response, error, 'The expense could not be saved.')
  }
})

financeAdminRouter.delete('/expenses/:id', async (request, response) => {
  try { await prisma.expense.delete({ where: { id: request.params.id } }); response.status(204).send() } catch (error) { respondToError(response, error, 'The expense could not be deleted.') }
})
