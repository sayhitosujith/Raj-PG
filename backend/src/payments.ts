import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from './db.js'
import { notifyInBackground, notifyRentRecorded } from './notifications.js'
import { isOnlinePaymentEnabled } from './razorpayConfig.js'
import { isUpiClaim, recordClaimedRent } from './upiClaims.js'
import { closeUpiQr, ensurePaymentQr, refreshQrPayment } from './upiQr.js'
import { normalizePhone } from './validation.js'

/**
 * Payments the owner records by hand (cash, UPI, bank transfer, ...), separate from the monthly
 * rent ledger (RentPayment) and Razorpay orders. Amounts are whole rupees.
 */
const paymentStatuses = ['paid', 'pending', 'failed'] as const
const paymentMethods = ['cash', 'upi', 'bank_transfer', 'cheque', 'card'] as const

type PaymentBody = { amount?: unknown; status?: unknown; method?: unknown; payerName?: unknown; phone?: unknown; bankName?: unknown; propertyId?: unknown; residentId?: unknown }
type PaymentFields = { amount: number; status: string; method: string; payerName: string; phone: string; bankName: string; propertyId: string; residentId: string | null }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const isOneOf = <T extends string>(options: readonly T[], value: string): value is T => (options as readonly string[]).includes(value)

/** Validates a create/update body into stored fields, or returns the message to show the owner. */
async function parsePayment(body: PaymentBody): Promise<PaymentFields | { error: string }> {
  const amount = Number(body.amount)
  if (!Number.isInteger(amount) || amount <= 0) return { error: 'Amount must be a whole number of rupees above zero.' }
  const status = text(body.status) || 'paid'
  if (!isOneOf(paymentStatuses, status)) return { error: 'Choose a valid status.' }
  const method = text(body.method)
  if (!isOneOf(paymentMethods, method)) return { error: 'Choose a payment type.' }
  const payerName = text(body.payerName)
  if (!payerName || payerName.length > 100) return { error: 'Enter the payer name (up to 100 characters).' }
  // Optional (a resident may have no phone on file), but a number that is given must be valid.
  const rawPhone = text(body.phone)
  const phone = rawPhone ? normalizePhone(rawPhone) : ''
  if (phone === null) return { error: 'Enter a valid 10-digit phone number, or leave it blank.' }
  // A bank only means something for non-cash payments; drop any leftover value for cash.
  const bankName = method === 'cash' ? '' : text(body.bankName)
  if (bankName.length > 100) return { error: 'Bank name must be up to 100 characters.' }
  const propertyId = text(body.propertyId)
  if (!propertyId) return { error: 'Select a property.' }
  const residentId = text(body.residentId) || null
  if (residentId) {
    const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { room: { select: { propertyId: true } } } })
    if (resident?.room.propertyId !== propertyId) return { error: 'That resident does not live in the selected property.' }
  }
  return { amount, status, method, payerName, phone, bankName, propertyId, residentId }
}

const withProperty = { include: { property: { select: { name: true } } } } as const
type PaymentWithProperty = Prisma.PaymentGetPayload<typeof withProperty>

function toPaymentSummary(payment: PaymentWithProperty) {
  const { property, ...fields } = payment
  return { ...fields, property: property.name }
}

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Payment was not found.' }); return }
  // P2003: the property id does not exist.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { response.status(400).json({ error: 'Select a valid property.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

// Polls Razorpay for QR payments still pending, so the list is right even without the webhook.
// Capped because each one is an API call; a failure leaves that row as it was.
const maxQrRefreshesPerList = 10
async function refreshPendingQrs(payments: PaymentWithProperty[]) {
  if (!isOnlinePaymentEnabled()) return payments
  const pending = payments.filter((payment) => payment.status === 'pending' && payment.razorpayQrId).slice(0, maxQrRefreshesPerList)
  const refreshed = new Map((await Promise.all(pending.map((payment) => refreshQrPayment(payment).catch(() => payment)))).map((payment) => [payment.id, payment]))
  return payments.map((payment) => ({ ...payment, ...refreshed.get(payment.id) }))
}

/** Owner routes for recorded payments; must be mounted behind the super admin guard. */
export const paymentsAdminRouter = Router()

paymentsAdminRouter.get('/payments', async (_request, response) => {
  if (!process.env.DATABASE_URL) { response.json([]); return }
  try {
    const payments = await prisma.payment.findMany({ ...withProperty, orderBy: { createdAt: 'desc' } })
    response.json((await refreshPendingQrs(payments)).map(toPaymentSummary))
  } catch (error) { respondToError(response, error, 'Payments could not be loaded.') }
})

paymentsAdminRouter.post('/payments', async (request, response) => {
  const fields = await parsePayment(request.body as PaymentBody)
  if ('error' in fields) { response.status(400).json(fields); return }
  try { response.status(201).json(toPaymentSummary(await prisma.payment.create({ data: fields, ...withProperty }))) } catch (error) { respondToError(response, error, 'Payment could not be created.') }
})

paymentsAdminRouter.put('/payments/:id', async (request, response) => {
  const fields = await parsePayment(request.body as PaymentBody)
  if ('error' in fields) { response.status(400).json(fields); return }
  try {
    const existing = await prisma.payment.findUniqueOrThrow({ where: { id: request.params.id } })
    // Razorpay owns the money side of a QR payment; only the payer details stay editable.
    if (existing.razorpayQrId && (fields.amount !== existing.amount || fields.status !== existing.status || fields.method !== existing.method)) { response.status(400).json({ error: 'The amount, type and status of a UPI QR payment are set by Razorpay and cannot be changed.' }); return }
    const updated = await prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.update({ where: { id: existing.id }, data: fields, ...withProperty })
      // Confirming a resident's UPI report is what records their rent months.
      if (existing.status !== 'paid' && payment.status === 'paid') await recordClaimedRent(transaction, payment)
      return payment
    })
    const claimedMonths = Array.isArray(updated.rentMonths) ? (updated.rentMonths as Array<{ month: string }>).map((item) => item.month) : []
    if (existing.status !== 'paid' && updated.status === 'paid' && updated.residentId && claimedMonths.length) {
      const residentId = updated.residentId
      notifyInBackground(() => notifyRentRecorded(residentId, claimedMonths))
    }
    response.json(toPaymentSummary(updated))
  } catch (error) { respondToError(response, error, 'Payment could not be updated.') }
})

paymentsAdminRouter.delete('/payments/:id', async (request, response) => {
  try {
    const payment = await prisma.payment.delete({ where: { id: request.params.id } })
    // An open code could still be paid after its row is gone; close it so it cannot.
    if (payment.razorpayQrId && payment.status === 'pending') await closeUpiQr(payment.razorpayQrId)
    response.status(204).send()
  } catch (error) { respondToError(response, error, 'Payment could not be deleted.') }
})

/** Shows a UPI QR for an unpaid payment (reusing its open code); Razorpay then marks it paid. */
paymentsAdminRouter.post('/payments/:id/upi-qr', async (request, response) => {
  if (!isOnlinePaymentEnabled()) { response.status(503).json({ error: 'UPI QR needs Razorpay. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server first.' }); return }
  try {
    const payment = await refreshQrPayment(await prisma.payment.findUniqueOrThrow({ where: { id: request.params.id } }))
    if (payment.status === 'paid') { response.status(409).json({ error: 'This payment is already paid.' }); return }
    // A resident's report is money already sent to your UPI ID; a Razorpay code would charge twice.
    if (isUpiClaim(payment)) { response.status(409).json({ error: 'The resident reported paying your UPI ID directly. Check the reference and mark it paid instead.' }); return }
    const withQr = await ensurePaymentQr(payment, `${payment.payerName} - Raj PG`)
    response.json(toPaymentSummary(await prisma.payment.findUniqueOrThrow({ where: { id: withQr.id }, ...withProperty })))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) { respondToError(response, error, 'Payment could not be loaded.'); return }
    console.error('Owner UPI QR failed:', error)
    response.status(502).json({ error: 'Razorpay could not create the QR code. Check that QR Codes are enabled on your Razorpay account.' })
  }
})

// Polled by the QR screen until the code is paid or expires.
paymentsAdminRouter.get('/payments/:id/upi-qr', async (request, response) => {
  try {
    const payment = await refreshQrPayment(await prisma.payment.findUniqueOrThrow({ where: { id: request.params.id } }))
    response.json(toPaymentSummary(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, ...withProperty })))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) { respondToError(response, error, 'Payment could not be loaded.'); return }
    console.error('Owner UPI QR status failed:', error)
    response.status(502).json({ error: 'Could not check the payment right now.' })
  }
})
