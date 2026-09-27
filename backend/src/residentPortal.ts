import { AadharVerificationStatus, UserRole, type WorkspaceSettings } from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { findAadharCardProblem, isValidAadharNumber } from './aadhar.js'
import { requireRole, startSession, type AuthContext } from './auth.js'
import { hashPassword, isAcceptablePassword, passwordRequirement, verifyPassword } from './credentials.js'
import { prisma } from './db.js'
import { toMealTimes } from './meals.js'
import { findProfilePhotoProblem, photoVersion, sendProfilePhoto, sendPropertyImage, sendUpiQr } from './photo.js'
import { rentSummary } from './rent.js'
import { createHash } from 'node:crypto'
import { pendingPolicyConsent, policiesOf } from './policies.js'
import { isOnlinePaymentEnabled } from './razorpayConfig.js'
import { getSettings, houseRulesOf, slotOptionsOf } from './settings.js'
import { findResidentByCredentials } from './residentCredentials.js'
import { rentItemsToPay } from './rentOrders.js'
import { normalizeUtr, pendingUpiClaim } from './upiClaims.js'

const requireResident = requireRole(UserRole.RESIDENT)

// Portal data stays locked until the resident has (1) replaced the handed-over access key with
// their own password and (2) had their Aadhaar details approved by the owner. Enforced here rather
// than only in the UI so the API cannot be used to skip either step.
export async function requirePortalAccess(_request: Request, response: Response, next: NextFunction) {
  const { userId } = response.locals.auth as AuthContext
  try {
    const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { active: true, passwordHash: true, aadharStatus: true, room: { select: { propertyId: true } } } })
    if (!resident?.active) { response.status(401).json({ error: 'Sign in required.' }); return }
    if (!resident.passwordHash) { response.status(403).json({ error: 'Choose a password to continue.', code: 'PASSWORD_REQUIRED' }); return }
    if (resident.aadharStatus !== AadharVerificationStatus.VERIFIED) { response.status(403).json({ error: 'Your Aadhaar verification must be approved first.', code: 'AADHAR_VERIFICATION_REQUIRED' }); return }
    response.locals.propertyId = resident.room.propertyId
    next()
  } catch (error) {
    console.error('Resident lookup failed:', error)
    response.status(503).json({ error: 'Resident portal is temporarily unavailable.' })
  }
}

/** Workspace details a resident needs: contacts, house rules, housekeeping slots and limit, and the policies. */
/**
 * How residents can pay the owner directly: a UPI ID, an uploaded QR image, or both; null hides
 * the panel. The QR image is served by its own route, referenced by version.
 */
function residentUpiPayee(settings: WorkspaceSettings) {
  if (!settings.upiId && !settings.upiQrUrl) return null
  return { id: settings.upiId, payeeName: settings.upiPayeeName || settings.businessName, qrVersion: photoVersion(settings.upiQrUpdatedAt) }
}

async function residentWorkspace() {
  const settings = await getSettings()
  return { businessName: settings.businessName, contactPhone: settings.contactPhone, contactEmail: settings.contactEmail, slots: slotOptionsOf(settings), housekeepingWeeklyLimit: settings.housekeepingWeeklyLimit, houseRules: houseRulesOf(settings), upi: residentUpiPayee(settings), ...policiesOf(settings) }
}

/** Resident-facing routes; each route applies its own guard so unmatched paths fall through. */
export const residentPortalRouter = Router()

/**
 * Where the resident's browser loads the property photo from. Uploaded images (data URLs, often
 * tens of KB) are served by their own route so the profile, re-fetched every minute, stays small;
 * a short content hash in the URL lets the browser cache it until the owner changes the photo.
 */
function propertyImageUrl(imageUrl: string) {
  if (!imageUrl.startsWith('data:')) return imageUrl
  return `/api/resident-portal/property-image?v=${createHash('sha1').update(imageUrl).digest('hex').slice(0, 10)}`
}

residentPortalRouter.post('/resident-portal/login', async (request, response) => {
  // `accessKey` is still accepted for callers written before residents had passwords.
  const { identifier, password, accessKey } = request.body as { identifier?: string; password?: string; accessKey?: string }
  const secret = password ?? accessKey
  if (!identifier?.trim() || !secret?.trim()) { response.status(400).json({ error: 'Email or phone and password are required.' }); return }
  if (!process.env.DATABASE_URL) { response.status(503).json({ error: 'Sign-in requires a database connection.' }); return }
  try {
    const match = await findResidentByCredentials(identifier.trim(), secret)
    if (!match) { response.status(401).json({ error: 'Invalid email/phone or password.' }); return }
    const token = await startSession(response, UserRole.RESIDENT, { residentId: match.resident.id })
    response.json({ token, mustSetPassword: match.mustSetPassword })
  } catch (error) {
    console.error('Resident login failed:', error)
    response.status(503).json({ error: 'Resident portal is temporarily unavailable.' })
  }
})

residentPortalRouter.get('/resident-portal/me', requireResident, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const resident = await prisma.resident.findUnique({ where: { id: userId }, include: { room: { include: { property: true } } } })
    if (!resident?.active) { response.status(401).json({ error: 'Sign in required.' }); return }
    const { id, name, phone, email, aadharNumber, permanentAddress, createdAt, joinedAt, passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, profilePhotoUpdatedAt, policiesAcceptedVersion, foodOpted, foodRequestedAt, room } = resident
    // Only the last four Aadhaar digits leave the server for the resident's own view.
    response.json({ id, name, phone, email, aadharLast4: aadharNumber ? aadharNumber.slice(-4) : null, permanentAddress, createdAt, joinedAt, room: room.number, property: room.property.name, location: room.property.location, mealTimes: toMealTimes(room.property), amenities: room.property.amenities, propertyImage: propertyImageUrl(room.property.imageUrl), rent: await rentSummary(id), onlinePayment: isOnlinePaymentEnabled(), foodOpted, foodRequestedAt, foodPlanRent: room.property.rentWithFood, policyConsent: pendingPolicyConsent(await getSettings(), policiesAcceptedVersion), workspace: await residentWorkspace(), mustSetPassword: !passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, pendingUpiClaim: await pendingUpiClaim(id), photoVersion: photoVersion(profilePhotoUpdatedAt) })
  } catch (error) {
    console.error('Resident profile failed:', error)
    response.status(503).json({ error: 'Resident portal is temporarily unavailable.' })
  }
})

residentPortalRouter.post('/resident-portal/password', requireResident, async (request, response) => {
  const { userId, sessionId } = response.locals.auth as AuthContext
  const { currentPassword, newPassword } = request.body as { currentPassword?: string; newPassword?: string }
  if (!isAcceptablePassword(newPassword)) { response.status(400).json({ error: passwordRequirement }); return }
  try {
    const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { passwordHash: true } })
    if (!resident) { response.status(401).json({ error: 'Sign in required.' }); return }
    // The first password is set from the access-key session itself; changing it later needs the old one.
    if (resident.passwordHash && !(currentPassword && verifyPassword(currentPassword, resident.passwordHash))) { response.status(400).json({ error: 'Current password is incorrect.' }); return }
    await prisma.$transaction([
      prisma.resident.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword), accessKeyHash: null } }),
      prisma.session.deleteMany({ where: { residentId: userId, id: { not: sessionId } } }),
    ])
    response.status(204).send()
  } catch (error) {
    console.error('Resident password change failed:', error)
    response.status(503).json({ error: 'Password could not be changed.' })
  }
})

// The resident's own submission; replaces whatever is on file and joins the owner's review queue.
// Allowed while not yet verified (including resubmitting a pending or rejected one).
residentPortalRouter.post('/resident-portal/aadhar', requireResident, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { aadharNumber, aadharCardUrl } = request.body as { aadharNumber?: string; aadharCardUrl?: string }
  const number = aadharNumber?.replace(/\s/g, '') ?? ''
  if (!isValidAadharNumber(number)) { response.status(400).json({ error: 'Aadhaar number must be 12 digits.' }); return }
  if (!aadharCardUrl) { response.status(400).json({ error: 'Upload a photo or PDF of your Aadhaar card.' }); return }
  const cardProblem = findAadharCardProblem(aadharCardUrl)
  if (cardProblem) { response.status(400).json({ error: cardProblem }); return }
  try {
    const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { passwordHash: true, aadharStatus: true } })
    if (!resident) { response.status(401).json({ error: 'Sign in required.' }); return }
    if (!resident.passwordHash) { response.status(403).json({ error: 'Choose a password to continue.', code: 'PASSWORD_REQUIRED' }); return }
    if (resident.aadharStatus === AadharVerificationStatus.VERIFIED) { response.status(409).json({ error: 'Your Aadhaar is already verified.' }); return }
    await prisma.resident.update({ where: { id: userId }, data: { aadharNumber: number, aadharCardUrl, aadharStatus: AadharVerificationStatus.PENDING, aadharSubmittedAt: new Date(), aadharRejectionReason: null, aadharReviewedAt: null } })
    response.status(204).send()
  } catch (error) {
    console.error('Aadhaar submission failed:', error)
    response.status(503).json({ error: 'Your Aadhaar details could not be submitted.' })
  }
})

residentPortalRouter.get('/resident-portal/photo', requireResident, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { profilePhotoUrl: true } })
    sendProfilePhoto(response, resident?.profilePhotoUrl)
  } catch (error) {
    console.error('Profile photo lookup failed:', error)
    response.status(503).json({ error: 'Profile photo could not be loaded.' })
  }
})

// Residents manage their own photo once they have full portal access.
residentPortalRouter.put('/resident-portal/photo', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { photo } = request.body as { photo?: unknown }
  const problem = findProfilePhotoProblem(photo)
  if (problem) { response.status(400).json({ error: problem }); return }
  try {
    const updated = await prisma.resident.update({ where: { id: userId }, data: { profilePhotoUrl: photo as string, profilePhotoUpdatedAt: new Date() }, select: { profilePhotoUpdatedAt: true } })
    response.json({ photoVersion: photoVersion(updated.profilePhotoUpdatedAt) })
  } catch (error) {
    console.error('Profile photo upload failed:', error)
    response.status(503).json({ error: 'Your photo could not be saved.' })
  }
})

residentPortalRouter.delete('/resident-portal/photo', requireResident, requirePortalAccess, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    await prisma.resident.update({ where: { id: userId }, data: { profilePhotoUrl: null, profilePhotoUpdatedAt: null } })
    response.status(204).send()
  } catch (error) {
    console.error('Profile photo removal failed:', error)
    response.status(503).json({ error: 'Your photo could not be removed.' })
  }
})

residentPortalRouter.get('/resident-portal/announcements', requireResident, requirePortalAccess, async (_request, response) => {
  const announcements = await prisma.announcement.findMany({ where: { propertyId: response.locals.propertyId as string }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, message: true, createdAt: true } })
  response.json(announcements)
})

// Accepts the policy version the resident was shown. If the owner changed a policy again since,
// the versions differ and the resident is sent back to read the newer text.
residentPortalRouter.post('/resident-portal/policies/accept', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { version } = request.body as { version?: unknown }
  if (typeof version !== 'string') { response.status(400).json({ error: 'Policy version is missing.' }); return }
  try {
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: userId }, select: { policiesAcceptedVersion: true } })
    const pending = pendingPolicyConsent(await getSettings(), resident.policiesAcceptedVersion)
    if (!pending) { response.json({ accepted: true }); return }
    if (pending.version !== version) { response.status(409).json({ error: 'The policies were updated again. Please review the latest version.', code: 'POLICY_CHANGED' }); return }
    await prisma.resident.update({ where: { id: userId }, data: { policiesAcceptedVersion: new Date(pending.version), policiesAcceptedAt: new Date() } })
    response.json({ accepted: true })
  } catch (error) {
    console.error('Policy acceptance failed:', error)
    response.status(503).json({ error: 'Your acceptance could not be saved. Please try again.' })
  }
})

// A resident without food asks to join the food plan. The owner decides (plan and rent only change
// on approval), so this just records the request; asking again keeps the original date.
residentPortalRouter.post('/resident-portal/food-request', requireResident, requirePortalAccess, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: userId }, select: { foodOpted: true, foodRequestedAt: true } })
    if (resident.foodOpted) { response.status(409).json({ error: 'Your plan already includes food.' }); return }
    const updated = resident.foodRequestedAt ? resident : await prisma.resident.update({ where: { id: userId }, data: { foodRequestedAt: new Date() }, select: { foodRequestedAt: true } })
    response.json({ foodRequestedAt: updated.foodRequestedAt })
  } catch (error) {
    console.error('Food request failed:', error)
    response.status(503).json({ error: 'Your request could not be sent. Please try again.' })
  }
})

// Upper bound for an amount the resident types in themselves (no rent set up).
const maxReportedAmount = 10_00_000

/**
 * "I've paid" after sending rent to the owner's UPI ID. The server, not the browser, decides the
 * amount and months (rentItemsToPay: what is owed, else next month in advance); with no rent set
 * up it takes the amount the resident typed, with no months. The owner confirms it against their
 * bank app. One open report at a time, so a double tap cannot file two.
 */
residentPortalRouter.post('/resident-portal/rent/upi-claim', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const reference = normalizeUtr((request.body as { reference?: unknown }).reference)
  if (!reference) { response.status(400).json({ error: 'Enter the 12-digit UPI reference number (UTR) from your payment app.' }); return }
  try {
    if (!residentUpiPayee(await getSettings())) { response.status(409).json({ error: 'Your property owner has not set up UPI payments.' }); return }
    if (await pendingUpiClaim(userId)) { response.status(409).json({ error: 'You already reported a payment. Your property owner will confirm it soon.' }); return }
    // With no rent set up there are no months to record, so the resident says what they sent; the
    // empty month list still marks it as a claim for the owner to confirm.
    const items = rentItemsToPay(await rentSummary(userId)) ?? []
    const amount = items.length ? items.reduce((sum, item) => sum + item.amount, 0) : Number((request.body as { amount?: unknown }).amount)
    if (!Number.isInteger(amount) || amount < 1 || amount > maxReportedAmount) { response.status(400).json({ error: 'Enter the amount you paid, in whole rupees.' }); return }
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true, room: { select: { propertyId: true } } } })
    await prisma.payment.create({ data: { amount, status: 'pending', method: 'upi', payerName: resident.name, phone: resident.phone ?? '', reference, rentMonths: items, propertyId: resident.room.propertyId, residentId: userId } })
    response.status(201).json({ pendingUpiClaim: await pendingUpiClaim(userId) })
  } catch (error) {
    console.error('UPI payment report failed:', error)
    response.status(503).json({ error: 'Your payment could not be reported. Please try again.' })
  }
})

residentPortalRouter.get('/resident-portal/property-image', requireResident, requirePortalAccess, async (_request, response) => {
  try {
    const property = await prisma.property.findUnique({ where: { id: response.locals.propertyId as string }, select: { imageUrl: true } })
    sendPropertyImage(response, property?.imageUrl)
  } catch (error) {
    console.error('Property image lookup failed:', error)
    response.status(503).json({ error: 'The property image could not be loaded.' })
  }
})

// The owner's uploaded UPI QR image, shown in the resident's pay panel.
residentPortalRouter.get('/resident-portal/upi-qr', requireResident, requirePortalAccess, async (_request, response) => {
  try {
    sendUpiQr(response, (await getSettings()).upiQrUrl)
  } catch (error) {
    console.error('UPI QR lookup failed:', error)
    response.status(503).json({ error: 'The QR image could not be loaded.' })
  }
})
