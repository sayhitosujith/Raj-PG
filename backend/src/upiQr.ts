import type { Payment } from '@prisma/client'
import { prisma } from './db.js'
import { razorpayRequest } from './razorpayClient.js'
import { fulfilOrder } from './rentOrders.js'

/**
 * UPI QR collection through Razorpay's QR Codes API: a single-use, fixed-amount code per Payment
 * row. Razorpay reports the credit by webhook (qr_code.credited); polling the code's payments is
 * the fallback, so the status still resolves when the webhook is missing or late.
 * https://razorpay.com/docs/api/qr-codes/
 */
const qrLifetimeMinutes = 15

type RazorpayQr = { id: string; image_url: string; close_by: number }
type RazorpayQrPayments = { items: Array<{ id: string; status: string; amount: number }> }

/** What a QR screen needs to show and poll. */
export type QrView = { paymentId: string; status: string; amount: number; imageUrl: string | null; expiresAt: Date | null }
export const toQrView = (payment: Payment): QrView => ({ paymentId: payment.id, status: payment.status, amount: payment.amount, imageUrl: payment.qrImageUrl, expiresAt: payment.qrExpiresAt })

/** Creates the Razorpay code. `label` shows in the payer's UPI app, so keep it recognisable. */
export async function createUpiQr(amountRupees: number, label: string, notes: Record<string, string>) {
  const qr = await razorpayRequest<RazorpayQr>('/payments/qr_codes', {
    type: 'upi_qr',
    name: label.slice(0, 40),
    usage: 'single_use',
    fixed_amount: true,
    payment_amount: amountRupees * 100,
    close_by: Math.floor(Date.now() / 1000) + qrLifetimeMinutes * 60,
    notes,
  })
  return { razorpayQrId: qr.id, qrImageUrl: qr.image_url, qrExpiresAt: new Date(qr.close_by * 1000) }
}

const hasLiveQr = (payment: Payment) => payment.status === 'pending' && Boolean(payment.razorpayQrId) && Boolean(payment.qrExpiresAt && payment.qrExpiresAt > new Date())

/**
 * Gives an unpaid payment a scannable code, reusing its current one while it is still open. A
 * failed (expired) payment gets a fresh code and goes back to pending.
 */
export async function ensurePaymentQr(payment: Payment, label: string) {
  if (hasLiveQr(payment)) return payment
  const qr = await createUpiQr(payment.amount, label, { paymentId: payment.id })
  return prisma.payment.update({ where: { id: payment.id }, data: { ...qr, status: 'pending', method: 'upi' } })
}

/**
 * Marks the payment behind a credited code as paid and, when the code settles a rent order, records
 * those months. Both steps are idempotent, so the webhook and polling can race safely; a credit
 * that arrives after the code was marked failed still wins.
 */
export async function settleQr(razorpayQrId: string, razorpayPaymentId: string) {
  await prisma.payment.updateMany({ where: { razorpayQrId, status: { not: 'paid' } }, data: { status: 'paid', razorpayPaymentId } })
  await fulfilOrder(razorpayQrId, razorpayPaymentId)
}

/** Asks Razorpay whether a pending code has been paid; marks it failed once it closes unpaid. */
export async function refreshQrPayment(payment: Payment): Promise<Payment> {
  if (payment.status !== 'pending' || !payment.razorpayQrId) return payment
  const { items } = await razorpayRequest<RazorpayQrPayments>(`/payments/qr_codes/${payment.razorpayQrId}/payments`)
  const captured = items.find((item) => item.status === 'captured')
  if (captured) await settleQr(payment.razorpayQrId, captured.id)
  else if (payment.qrExpiresAt && payment.qrExpiresAt < new Date()) await prisma.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'failed' } })
  else return payment
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
}

/** Closes a code so it can no longer be paid; best effort, since it also closes itself on expiry. */
export async function closeUpiQr(razorpayQrId: string) {
  await razorpayRequest(`/payments/qr_codes/${razorpayQrId}/close`, {}).catch((error: unknown) => console.warn('Closing UPI QR failed:', error))
}
