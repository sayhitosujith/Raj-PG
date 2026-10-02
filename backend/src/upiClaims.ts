import { Prisma, type Payment } from '@prisma/client'
import { prisma } from './db.js'
import type { OrderItem } from './rentOrders.js'
import { revokeCredentialsIfLocked } from './rentLock.js'

/**
 * "I've paid" reports for rent sent straight to the owner's UPI ID. The app cannot see those
 * transfers, so a report is a pending Payment carrying the resident's UPI reference (UTR) and the
 * months it covers; the owner checks their bank app and marks it paid, which records the months.
 */
const utrPattern = /^\d{12}$/

/** The 12-digit UPI reference as typed (spaces allowed), or null when it is not one. */
export function normalizeUtr(value: unknown) {
  const digits = typeof value === 'string' ? value.replace(/\s/g, '') : ''
  return utrPattern.test(digits) ? digits : null
}

/** A claim is a UPI transfer the resident reported, with no Razorpay code behind it. */
export const isUpiClaim = (payment: Pick<Payment, 'rentMonths' | 'razorpayQrId'>) => payment.rentMonths !== null && payment.razorpayQrId === null

/** The resident's report still waiting for the owner, if any; shown instead of the form. */
export async function pendingUpiClaim(residentId: string) {
  return prisma.payment.findFirst({ where: { residentId, status: 'pending', razorpayQrId: null, rentMonths: { not: Prisma.DbNull } }, orderBy: { createdAt: 'desc' }, select: { amount: true, reference: true, rentMonths: true, createdAt: true } })
}

/**
 * Records the claimed months once the owner marks the claim paid. Months already recorded some
 * other way are skipped, so marking paid twice (or after a manual entry) never duplicates rent.
 */
export async function recordClaimedRent(transaction: Prisma.TransactionClient, payment: Payment) {
  if (!payment.residentId || !isUpiClaim(payment)) return
  const residentId = payment.residentId
  const items = payment.rentMonths as OrderItem[]
  // A resident locked out for overdue rent gets a new access key from the owner, not their old one back.
  await revokeCredentialsIfLocked(transaction, residentId)
  await transaction.rentPayment.createMany({ data: items.map((item) => ({ residentId, month: item.month, amount: item.amount })), skipDuplicates: true })
}
