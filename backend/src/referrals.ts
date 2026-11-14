import { Prisma } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { prisma } from './db.js'
import { rentSummary } from './rent.js'
import { isFeatureOn } from './residentFeatureGate.js'

/**
 * Referral rewards. Each resident's "Refer a friend" link carries their referral code; a booking made
 * through it records the referrer. When that friend becomes a resident and their first rent payment
 * is recorded, the referrer gets a rent concession: a percentage off one month (their first unpaid
 * month from now on), applied wherever rent is priced. Once per friend; the owner can cancel it until
 * that month is paid.
 */
export const referralRewardPercent = 10

// Letters and digits that cannot be misread (no 0/O, 1/I/L), so a code read aloud still works.
const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const codeLength = 8

function newCode() {
  return Array.from(randomBytes(codeLength), (byte) => codeAlphabet[byte % codeAlphabet.length]).join('')
}

/** The resident's referral code, made and saved the first time it is needed. */
export async function ensureReferralCode(residentId: string) {
  const resident = await prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { referralCode: true } })
  if (resident.referralCode) return resident.referralCode
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode()
    try {
      await prisma.resident.update({ where: { id: residentId }, data: { referralCode: code } })
      return code
    } catch (error) {
      // Another resident already has this code: try a new one.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
    }
  }
  throw new Error('Could not make a unique referral code.')
}

/**
 * The active resident a referral code belongs to, or null (unknown codes are ignored, not errors). Also
 * null while Refer a friend is switched off, so links shared earlier earn nothing new; friends already
 * referred still bring their reward once they pay.
 */
export async function referrerForCode(code: unknown) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{4,16}$/i.test(code.trim())) return null
  if (!await isFeatureOn('referral')) return null
  const resident = await prisma.resident.findFirst({ where: { referralCode: code.trim().toUpperCase(), active: true, deletedAt: null }, select: { id: true } })
  return resident?.id ?? null
}

const monthAfter = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * Grants the referral reward for `friendId` if it is due: the friend came through someone's
 * referral link, has paid at least one month, and no reward was given for them yet. Call after
 * recording a rent payment. Never throws: a failure here must not undo the payment, so it is logged.
 */
export async function grantReferralReward(friendId: string) {
  try {
    const booking = await prisma.booking.findFirst({ where: { residentId: friendId, referrerResidentId: { not: null } }, orderBy: { createdAt: 'asc' }, select: { referrerResidentId: true } })
    const referrerId = booking?.referrerResidentId
    if (!referrerId || referrerId === friendId) return
    const [friend, referrer, alreadyGiven] = await Promise.all([
      prisma.resident.findUnique({ where: { id: friendId }, select: { name: true, _count: { select: { rentPayments: true } } } }),
      prisma.resident.findUnique({ where: { id: referrerId }, select: { active: true, deletedAt: true, monthlyRent: true, rentPayments: { select: { month: true } }, rentConcessions: { where: { status: 'ACTIVE' }, select: { month: true } } } }),
      prisma.rentConcession.findUnique({ where: { referredResidentId: friendId }, select: { id: true } }),
    ])
    if (!friend?._count.rentPayments || !referrer?.active || referrer.deletedAt || !referrer.monthlyRent || alreadyGiven) return
    // The first month from now that is unpaid and carries no other concession, so rewards do not stack on one month.
    const status = await rentSummary(referrerId)
    const taken = new Set([...referrer.rentPayments.map((payment) => payment.month), ...referrer.rentConcessions.map((concession) => concession.month)])
    let month = status.outstandingMonths.find((owed) => !taken.has(owed)) ?? status.currentMonth
    while (taken.has(month)) month = monthAfter(month)
    await prisma.rentConcession.create({ data: { residentId: referrerId, month, percent: referralRewardPercent, reason: `Referral reward: ${friend.name} joined`, referredResidentId: friendId } })
  } catch (error) {
    // A race that already granted this friend's reward is not an error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
    console.error('Granting a referral reward failed:', error)
  }
}

/** Owner routes for concessions; mounted behind the super admin guard. */
export const concessionAdminRouter = Router()

// Cancels a concession before its month is paid (once paid, the discount is already in the record).
concessionAdminRouter.post('/residents/:id/concessions/:concessionId/cancel', async (request, response) => {
  const { id, concessionId } = request.params
  try {
    const concession = await prisma.rentConcession.findFirst({ where: { id: concessionId, residentId: id, status: 'ACTIVE' }, select: { month: true } })
    if (!concession) { response.status(404).json({ error: 'That concession was not found.' }); return }
    const paid = await prisma.rentPayment.findUnique({ where: { residentId_month: { residentId: id, month: concession.month } }, select: { id: true } })
    if (paid) { response.status(409).json({ error: 'That month is already paid with the discount, so it can no longer be cancelled.' }); return }
    await prisma.rentConcession.update({ where: { id: concessionId }, data: { status: 'CANCELLED' } })
    response.status(204).send()
  } catch (error) {
    console.error('Cancelling a concession failed:', error)
    response.status(503).json({ error: 'The concession could not be cancelled.' })
  }
})
