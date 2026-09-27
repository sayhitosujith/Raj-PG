import { createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma, RentOrderStatus, UserRole } from '@prisma/client'
import { Router, type Request, type Response } from 'express'
import { requireRole, type AuthContext } from './auth.js'
import { prisma } from './db.js'
import { rentSummary } from './rent.js'
import { isOnlinePaymentEnabled, razorpayKeyId as keyId, razorpayKeySecret as keySecret } from './razorpayConfig.js'
import { requirePortalAccess } from './residentPortal.js'

/**
 * Online rent payments through Razorpay (orders API + Checkout). The server alone decides what is
 * owed: it snapshots the outstanding months into a RentOrder and asks Razorpay for an order of
 * exactly that total. A payment is recorded only after its signature verifies, either from the
 * browser's Checkout callback or from Razorpay's webhook (whichever arrives first); recording is
 * idempotent, so the second one is a no-op.
 *
 * Needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (and RAZORPAY_WEBHOOK_SECRET for the webhook).
 * Without the keys online payment is simply switched off.
 */
type OrderItem = { month: string; amount: number }

// Constant-time comparison of a hex HMAC against the signature Razorpay sent.
function signatureMatches(payload: string, secret: string, signature: unknown) {
  if (typeof signature !== 'string' || !/^[0-9a-f]+$/i.test(signature)) return false
  const expected = createHmac('sha256', secret).update(payload).digest()
  const received = Buffer.from(signature, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

async function createRazorpayOrder(amountRupees: number, receipt: string, notes: Record<string, string>) {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${keyId()}:${keySecret()}`).toString('base64')}` },
    // Razorpay amounts are in paise.
    body: JSON.stringify({ amount: amountRupees * 100, currency: 'INR', receipt, notes }),
  })
  if (!response.ok) throw new Error(`Razorpay order failed (${response.status}): ${await response.text()}`)
  return await response.json() as { id: string; amount: number; currency: string }
}

/**
 * Records a verified payment against its order: one RentPayment per month in the snapshot. Months
 * the owner already marked paid in the meantime are skipped (and logged, as that is an
 * overpayment to settle by hand). Safe to call twice for the same order.
 */
async function fulfilOrder(razorpayOrderId: string, razorpayPaymentId: string) {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.rentOrder.findUnique({ where: { razorpayOrderId } })
    if (!order || order.status === RentOrderStatus.PAID) return
    const items = order.items as OrderItem[]
    const created = await transaction.rentPayment.createMany({ data: items.map((item) => ({ residentId: order.residentId, month: item.month, amount: item.amount, razorpayPaymentId })), skipDuplicates: true })
    if (created.count < items.length) console.warn(`Razorpay order ${razorpayOrderId}: ${items.length - created.count} month(s) were already marked paid; payment ${razorpayPaymentId} includes an overpayment.`)
    await transaction.rentOrder.update({ where: { id: order.id }, data: { status: RentOrderStatus.PAID, razorpayPaymentId, paidAt: new Date() } })
  })
}

/** Resident routes; mounted before the super admin guard, so each checks the resident role itself. */
export const razorpayResidentRouter = Router()
const requireResident = requireRole(UserRole.RESIDENT)

// Starts a payment for everything currently owed (all outstanding months, late fees included).
razorpayResidentRouter.post('/resident-portal/rent/order', requireResident, requirePortalAccess, async (_request, response) => {
  if (!isOnlinePaymentEnabled()) { response.status(503).json({ error: 'Online payment is not set up yet. Please pay your property owner directly.' }); return }
  const { userId } = response.locals.auth as AuthContext
  try {
    const rent = await rentSummary(userId)
    if (!rent.monthlyRent || !rent.outstandingMonths.length) { response.status(409).json({ error: 'You have no rent due right now.' }); return }
    const items: OrderItem[] = rent.outstandingMonths.map((month) => ({ month, amount: rent.monthlyRent! + (rent.overdueMonths.includes(month) ? rent.lateFee : 0) }))
    const amount = items.reduce((sum, item) => sum + item.amount, 0)
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true } })
    // Receipts are limited to 40 characters by Razorpay.
    const razorpayOrder = await createRazorpayOrder(amount, `rent-${userId.slice(-12)}-${Date.now()}`, { residentId: userId, months: items.map((item) => item.month).join(',') })
    await prisma.rentOrder.create({ data: { residentId: userId, razorpayOrderId: razorpayOrder.id, amount, items } })
    response.status(201).json({ keyId: keyId(), orderId: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency, months: items.map((item) => item.month), prefill: { name: resident.name, email: resident.email ?? undefined, contact: resident.phone ?? undefined } })
  } catch (error) {
    console.error('Rent order failed:', error)
    response.status(502).json({ error: 'Could not start the payment. Please try again in a moment.' })
  }
})

// Checkout's success callback: verify the signature, then record the payment.
razorpayResidentRouter.post('/resident-portal/rent/verify', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = request.body as Record<string, unknown>
  if (typeof orderId !== 'string' || typeof paymentId !== 'string' || !keySecret()) { response.status(400).json({ error: 'Payment details are missing.' }); return }
  if (!signatureMatches(`${orderId}|${paymentId}`, keySecret()!, signature)) { response.status(400).json({ error: 'The payment could not be verified. If money was taken, it will be matched automatically or you can contact your property owner.' }); return }
  try {
    const order = await prisma.rentOrder.findUnique({ where: { razorpayOrderId: orderId }, select: { residentId: true } })
    if (!order || order.residentId !== userId) { response.status(404).json({ error: 'Payment was not found.' }); return }
    await fulfilOrder(orderId, paymentId)
    response.json(await rentSummary(userId))
  } catch (error) {
    console.error('Rent payment verification failed:', error)
    response.status(503).json({ error: 'Your payment went through but could not be recorded yet. It will update shortly.' })
  }
})

/**
 * Razorpay webhook (payment.captured / order.paid). Mounted with a raw body parser because the
 * signature covers the exact bytes Razorpay sent. Always 200s once verified so Razorpay does not
 * retry events we deliberately ignore.
 */
export async function razorpayWebhook(request: Request, response: Response) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  const body = request.body as Buffer
  if (!secret || !Buffer.isBuffer(body) || !signatureMatches(body.toString('utf8'), secret, request.header('x-razorpay-signature'))) { response.status(400).send('invalid signature'); return }
  try {
    const event = JSON.parse(body.toString('utf8')) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } }
    const payment = event.payload?.payment?.entity
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.id && payment.order_id) await fulfilOrder(payment.order_id, payment.id)
    response.status(200).send('ok')
  } catch (error) {
    // A 5xx makes Razorpay retry, which is what we want if recording failed.
    console.error('Razorpay webhook failed:', error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error)
    response.status(500).send('error')
  }
}
