import { RentOrderStatus } from '@prisma/client'
import { prisma } from './db.js'
import type { rentSummary } from './rent.js'

/** One month in a rent order's snapshot: the month and what was owed for it, late fee included. */
export type OrderItem = { month: string; amount: number }

/** Everything the resident owes right now, month by month, or null when nothing is due. */
export function outstandingRentItems(rent: Awaited<ReturnType<typeof rentSummary>>): OrderItem[] | null {
  if (!rent.monthlyRent || !rent.outstandingMonths.length) return null
  const monthlyRent = rent.monthlyRent
  return rent.outstandingMonths.map((month) => ({ month, amount: monthlyRent + (rent.overdueMonths.includes(month) ? rent.lateFee : 0) }))
}

const monthAfter = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * What a direct UPI payment covers: everything owed or, when nothing is, the next unpaid month
 * in advance (e.g. someone who moved in after the due day paying their first month early).
 * Mirrors nextMonthToRecord in the web app; the recent payments include any advance months.
 */
export function rentItemsToPay(rent: Awaited<ReturnType<typeof rentSummary>>): OrderItem[] | null {
  const owed = outstandingRentItems(rent)
  if (owed) return owed
  if (rent.state === 'NOT_TRACKED' || !rent.monthlyRent) return null
  const paid = new Set(rent.payments.map((payment) => payment.month))
  let month = monthAfter(rent.currentMonth)
  while (paid.has(month)) month = monthAfter(month)
  return [{ month, amount: rent.monthlyRent }]
}

/**
 * Records a verified payment against its order: one RentPayment per month in the snapshot. Months
 * the owner already marked paid in the meantime are skipped (and logged, as that is an
 * overpayment to settle by hand). Safe to call twice for the same order, and a no-op for ids with
 * no rent order (e.g. an owner's QR code for a one-off payment).
 */
export async function fulfilOrder(razorpayOrderId: string, razorpayPaymentId: string) {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.rentOrder.findUnique({ where: { razorpayOrderId } })
    if (!order || order.status === RentOrderStatus.PAID) return
    const items = order.items as OrderItem[]
    const created = await transaction.rentPayment.createMany({ data: items.map((item) => ({ residentId: order.residentId, month: item.month, amount: item.amount, razorpayPaymentId })), skipDuplicates: true })
    if (created.count < items.length) console.warn(`Razorpay order ${razorpayOrderId}: ${items.length - created.count} month(s) were already marked paid; payment ${razorpayPaymentId} includes an overpayment.`)
    await transaction.rentOrder.update({ where: { id: order.id }, data: { status: RentOrderStatus.PAID, razorpayPaymentId, paidAt: new Date() } })
  })
}
