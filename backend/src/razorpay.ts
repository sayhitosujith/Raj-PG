import { createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma, UserRole } from '@prisma/client'
import { Router, type Request, type Response } from 'express'
import { requireRole, type AuthContext } from './auth.js'
import { prisma } from './db.js'
import { rentSummary } from './rent.js'
import { razorpayRequest } from './razorpayClient.js'
import { isOnlinePaymentEnabled, razorpayKeyId as keyId, razorpayKeySecret as keySecret } from './razorpayConfig.js'
import { fulfilOrder, outstandingRentItems } from './rentOrders.js'
import { requirePortalAccess } from './residentPortal.js'
import { requireResidentFeature } from './residentFeatureGate.js'
import { createUpiQr, refreshQrPayment, settleQr, toQrView } from './upiQr.js'

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

// Constant-time comparison of a hex HMAC against the signature Razorpay sent.
function signatureMatches(payload: string, secret: string, signature: unknown) {
  if (typeof signature !== 'string' || !/^[0-9a-f]+$/i.test(signature)) return false
  const expected = createHmac('sha256', secret).update(payload).digest()
  const received = Buffer.from(signature, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/** Resident routes; mounted before the super admin guard, so each checks the resident role itself. */
export const razorpayResidentRouter = Router()
const requireResident = requireRole(UserRole.RESIDENT)

// Starts a payment for everything currently owed (all outstanding months, late fees included).
razorpayResidentRouter.post('/resident-portal/rent/order', requireResident, requirePortalAccess, requireResidentFeature('payments'), async (_request, response) => {
  if (!isOnlinePaymentEnabled()) { response.status(503).json({ error: 'Online payment is not set up yet. Please pay your property owner directly.' }); return }
  const { userId } = response.locals.auth as AuthContext
  try {
    const rent = await rentSummary(userId)
    const items = outstandingRentItems(rent)
    if (!items) { response.status(409).json({ error: 'You have no rent due right now.' }); return }
    const amount = items.reduce((sum, item) => sum + item.amount, 0)
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true } })
    // Receipts are limited to 40 characters by Razorpay.
    const razorpayOrder = await razorpayRequest<{ id: string; amount: number; currency: string }>('/orders', { amount: amount * 100, currency: 'INR', receipt: `rent-${userId.slice(-12)}-${Date.now()}`, notes: { residentId: userId, months: items.map((item) => item.month).join(',') } })
    await prisma.rentOrder.create({ data: { residentId: userId, razorpayOrderId: razorpayOrder.id, amount, items } })
    response.status(201).json({ keyId: keyId(), orderId: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency, months: items.map((item) => item.month), prefill: { name: resident.name, email: resident.email ?? undefined, contact: resident.phone ?? undefined } })
  } catch (error) {
    console.error('Rent order failed:', error)
    response.status(502).json({ error: 'Could not start the payment. Please try again in a moment.' })
  }
})

// Checkout's success callback: verify the signature, then record the payment.
razorpayResidentRouter.post('/resident-portal/rent/verify', requireResident, requirePortalAccess, requireResidentFeature('payments'), async (request, response) => {
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
 * Shows a UPI QR for everything owed. The amount is snapshotted into a RentOrder keyed by the QR
 * id, plus a pending Payment so the owner's Payments list shows it; an open code for the same
 * amount is reused, so refreshing the page does not pile up pending rows.
 */
razorpayResidentRouter.post('/resident-portal/rent/upi-qr', requireResident, requirePortalAccess, requireResidentFeature('payments'), async (_request, response) => {
  if (!isOnlinePaymentEnabled()) { response.status(503).json({ error: 'Online payment is not set up yet. Please pay your property owner directly.' }); return }
  const { userId } = response.locals.auth as AuthContext
  try {
    const items = outstandingRentItems(await rentSummary(userId))
    if (!items) { response.status(409).json({ error: 'You have no rent due right now.' }); return }
    const amount = items.reduce((sum, item) => sum + item.amount, 0)
    const open = await prisma.payment.findFirst({ where: { residentId: userId, status: 'pending', amount, razorpayQrId: { not: null }, qrExpiresAt: { gt: new Date() } } })
    if (open) { response.json(toQrView(open)); return }
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true, room: { select: { propertyId: true } } } })
    if (!resident.room) { response.status(409).json({ error: 'You have moved out, so there is no rent to pay online.' }); return }
    const qr = await createUpiQr(amount, `Rent - ${resident.name}`, { residentId: userId, months: items.map((item) => item.month).join(',') })
    const [, payment] = await prisma.$transaction([
      prisma.rentOrder.create({ data: { residentId: userId, razorpayOrderId: qr.razorpayQrId, amount, items } }),
      prisma.payment.create({ data: { ...qr, amount, status: 'pending', method: 'upi', payerName: resident.name, phone: resident.phone ?? '', propertyId: resident.room!.propertyId, residentId: userId } }),
    ])
    response.status(201).json(toQrView(payment))
  } catch (error) {
    console.error('Rent UPI QR failed:', error)
    response.status(502).json({ error: 'Could not create the UPI QR code. Please try again in a moment.' })
  }
})

// Polled by the QR screen until the code is paid or expires.
razorpayResidentRouter.get('/resident-portal/rent/upi-qr/:paymentId', requireResident, requirePortalAccess, requireResidentFeature('payments'), async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const payment = await prisma.payment.findUnique({ where: { id: (request.params as { paymentId: string }).paymentId } })
    if (!payment || payment.residentId !== userId) { response.status(404).json({ error: 'Payment was not found.' }); return }
    response.json(toQrView(await refreshQrPayment(payment)))
  } catch (error) {
    console.error('Rent UPI QR status failed:', error)
    response.status(502).json({ error: 'Could not check the payment right now.' })
  }
})

/**
 * Razorpay webhook (payment.captured / order.paid for Checkout, qr_code.credited for UPI QR). Mounted with a raw body parser because the
 * signature covers the exact bytes Razorpay sent. Always 200s once verified so Razorpay does not
 * retry events we deliberately ignore.
 */
export async function razorpayWebhook(request: Request, response: Response) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  const body = request.body as Buffer
  if (!secret || !Buffer.isBuffer(body) || !signatureMatches(body.toString('utf8'), secret, request.header('x-razorpay-signature'))) { response.status(400).send('invalid signature'); return }
  try {
    const event = JSON.parse(body.toString('utf8')) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } }; qr_code?: { entity?: { id?: string } } } }
    const payment = event.payload?.payment?.entity
    const qrId = event.payload?.qr_code?.entity?.id
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.id && payment.order_id) await fulfilOrder(payment.order_id, payment.id)
    if (event.event === 'qr_code.credited' && qrId && payment?.id) await settleQr(qrId, payment.id)
    response.status(200).send('ok')
  } catch (error) {
    // A 5xx makes Razorpay retry, which is what we want if recording failed.
    console.error('Razorpay webhook failed:', error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error)
    response.status(500).send('error')
  }
}
