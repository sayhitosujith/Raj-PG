import { AadharVerificationStatus, UserRole, type WorkspaceSettings } from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { findDuplicate } from './duplicates.js'
import { findExpiredDocument, hasCompleteIdentity, identityDocumentName, identityWrite, indianNationality, parseIdentityFields, type IdentityInput } from './identityDocuments.js'
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
import { loadRentReceipt, renderRentReceipt } from './receipts.js'
import { currentWeather } from './weather.js'

const requireResident = requireRole(UserRole.RESIDENT)

// Portal data stays locked until the resident has (1) replaced the handed-over access key with
// their own password and (2) had their identity documents approved by the owner. Enforced here rather
// than only in the UI so the API cannot be used to skip either step.
export async function requirePortalAccess(_request: Request, response: Response, next: NextFunction) {
  const { userId } = response.locals.auth as AuthContext
  try {
    const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { active: true, passwordHash: true, aadharStatus: true, room: { select: { propertyId: true } } } })
    if (!resident?.active) { response.status(401).json({ error: 'Sign in required.' }); return }
    if (!resident.passwordHash) { response.status(403).json({ error: 'Choose a password to continue.', code: 'PASSWORD_REQUIRED' }); return }
    if (resident.aadharStatus !== AadharVerificationStatus.VERIFIED) { response.status(403).json({ error: 'Your ID verification must be approved first.', code: 'AADHAR_VERIFICATION_REQUIRED' }); return }
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
    const { nationality, passportNumber } = resident
    const { id, name, phone, email, aadharNumber, permanentAddress, createdAt, joinedAt, passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, profilePhotoUpdatedAt, policiesAcceptedVersion, foodOpted, foodRequestedAt, whatsappOptIn, emailOptIn, room } = resident
    // Only the last four document characters leave the server for the resident's own view.
    response.json({ emailOptIn, id, name, phone, email, nationality, aadharLast4: aadharNumber ? aadharNumber.slice(-4) : null, passportLast4: passportNumber ? passportNumber.slice(-4) : null, permanentAddress, createdAt, joinedAt, room: room.number, property: room.property.name, location: room.property.location, mealTimes: toMealTimes(room.property), amenities: room.property.amenities, housekeepingStaff: room.property.housekeepingStaff, propertyImage: propertyImageUrl(room.property.imageUrl), rent: await rentSummary(id), onlinePayment: isOnlinePaymentEnabled(), foodOpted, foodRequestedAt, foodPlanRent: room.property.rentWithFood, policyConsent: pendingPolicyConsent(await getSettings(), policiesAcceptedVersion), workspace: await residentWorkspace(), mustSetPassword: !passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, whatsappOptIn, pendingUpiClaim: await pendingUpiClaim(id), photoVersion: photoVersion(profilePhotoUpdatedAt) })
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

// The resident's own submission: their nationality and the matching document set (Aadhaar, or
// passport and visa), all required. Replaces whatever is on file, clears the other set, and joins
// the owner's review queue. Allowed while not yet verified (including resubmitting a pending or
// rejected one).
residentPortalRouter.post('/resident-portal/identity', requireResident, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const parsed = parseIdentityFields(request.body as IdentityInput)
  if (!parsed.ok) { response.status(400).json({ error: parsed.error }); return }
  const { fields } = parsed
  const nationality = fields.nationality ?? indianNationality
  const isComplete = hasCompleteIdentity({ ...fields, nationality, hasAadharCard: Boolean(fields.aadharCardUrl), hasPassportScan: Boolean(fields.passportScanUrl) })
  if (!isComplete) { response.status(400).json({ error: identityDocumentName(nationality) === 'Aadhaar' ? 'Enter your Aadhaar number and upload a photo or PDF of your card.' : 'Enter your passport and visa details and upload a photo or PDF of your passport photo page.' }); return }
  const expired = findExpiredDocument(fields)
  if (expired) { response.status(400).json({ error: expired }); return }
  try {
    const resident = await prisma.resident.findUnique({ where: { id: userId }, select: { passwordHash: true, aadharStatus: true } })
    if (!resident) { response.status(401).json({ error: 'Sign in required.' }); return }
    if (!resident.passwordHash) { response.status(403).json({ error: 'Choose a password to continue.', code: 'PASSWORD_REQUIRED' }); return }
    if (resident.aadharStatus === AadharVerificationStatus.VERIFIED) { response.status(409).json({ error: 'Your ID is already verified.' }); return }
    // Residents are not told whose account holds the number, only that it is taken.
    const duplicate = await findDuplicate(prisma, { aadharNumber: fields.aadharNumber, passportNumber: fields.passportNumber }, { residentId: userId }, { revealOwner: false })
    if (duplicate) { response.status(409).json({ error: duplicate }); return }
    await prisma.resident.update({ where: { id: userId }, data: { nationality, ...identityWrite(nationality, fields), aadharStatus: AadharVerificationStatus.PENDING, aadharSubmittedAt: new Date(), aadharRejectionReason: null, aadharReviewedAt: null } })
    response.status(204).send()
  } catch (error) {
    console.error('ID submission failed:', error)
    response.status(503).json({ error: 'Your details could not be submitted.' })
  }
})

// Current weather in the resident's property city; 204 when there is none to show (no city set,
// weather not configured, or the lookup failed), so the portal just leaves it out.
residentPortalRouter.get('/resident-portal/weather', requireResident, requirePortalAccess, async (_request, response) => {
  try {
    const property = await prisma.property.findUnique({ where: { id: response.locals.propertyId as string }, select: { city: true } })
    const weather = property?.city ? await currentWeather(property.city) : null
    if (!weather) { response.status(204).send(); return }
    response.json(weather)
  } catch (error) {
    console.error('Weather lookup failed:', error)
    response.status(204).send()
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
  // The UTR is optional (it helps the owner match the transfer), but one that is given must be valid.
  const rawReference = (request.body as { reference?: unknown }).reference
  const hasReference = typeof rawReference === 'string' && rawReference.trim() !== ''
  const reference = hasReference ? normalizeUtr(rawReference) : ''
  if (reference === null) { response.status(400).json({ error: 'A UPI reference (UTR) has 12 digits. Check it, or leave it blank.' }); return }
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

// A PDF receipt for one of the resident's own recorded rent months.
residentPortalRouter.get('/resident-portal/rent/receipts/:rentPaymentId', requireResident, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const receipt = await loadRentReceipt(userId, (request.params as { rentPaymentId: string }).rentPaymentId)
    if (!receipt) { response.status(404).json({ error: 'Receipt was not found.' }); return }
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="rent-receipt-${receipt.number}.pdf"`, 'Cache-Control': 'private, no-store' }).send(await renderRentReceipt(receipt))
  } catch (error) {
    console.error('Rent receipt failed:', error)
    response.status(503).json({ error: 'The receipt could not be created. Please try again.' })
  }
})


// The resident turns WhatsApp and/or email updates on or off; send only the channels that change.
residentPortalRouter.put('/resident-portal/preferences', requireResident, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { whatsappOptIn, emailOptIn } = request.body as { whatsappOptIn?: unknown; emailOptIn?: unknown }
  if ((whatsappOptIn !== undefined && typeof whatsappOptIn !== 'boolean') || (emailOptIn !== undefined && typeof emailOptIn !== 'boolean') || (whatsappOptIn === undefined && emailOptIn === undefined)) { response.status(400).json({ error: 'Choose on or off.' }); return }
  try {
    const saved = await prisma.resident.update({ where: { id: userId }, data: { ...(whatsappOptIn !== undefined ? { whatsappOptIn } : {}), ...(emailOptIn !== undefined ? { emailOptIn } : {}) }, select: { whatsappOptIn: true, emailOptIn: true } })
    response.json(saved)
  } catch (error) {
    console.error('Notification preference update failed:', error)
    response.status(503).json({ error: 'Your preference could not be saved. Please try again.' })
  }
})
