import { AadharVerificationStatus, UserRole } from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { findAadharCardProblem, isValidAadharNumber } from './aadhar.js'
import { requireRole, startSession, type AuthContext } from './auth.js'
import { hashPassword, isAcceptablePassword, passwordRequirement, verifyPassword } from './credentials.js'
import { prisma } from './db.js'
import { toMealTimes } from './meals.js'
import { findProfilePhotoProblem, photoVersion, sendProfilePhoto } from './photo.js'
import { rentSummary } from './rent.js'
import { pendingPolicyConsent, policiesOf } from './policies.js'
import { getSettings, houseRulesOf, slotOptionsOf } from './settings.js'
import { findResidentByCredentials } from './residentCredentials.js'

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
async function residentWorkspace() {
  const settings = await getSettings()
  return { businessName: settings.businessName, contactPhone: settings.contactPhone, contactEmail: settings.contactEmail, slots: slotOptionsOf(settings), housekeepingWeeklyLimit: settings.housekeepingWeeklyLimit, houseRules: houseRulesOf(settings), ...policiesOf(settings) }
}

/** Resident-facing routes; each route applies its own guard so unmatched paths fall through. */
export const residentPortalRouter = Router()

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
    const { id, name, phone, email, aadharNumber, permanentAddress, createdAt, joinedAt, passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, profilePhotoUpdatedAt, policiesAcceptedVersion, room } = resident
    // Only the last four Aadhaar digits leave the server for the resident's own view.
    response.json({ id, name, phone, email, aadharLast4: aadharNumber ? aadharNumber.slice(-4) : null, permanentAddress, createdAt, joinedAt, room: room.number, property: room.property.name, location: room.property.location, mealTimes: toMealTimes(room.property), amenities: room.property.amenities, rent: await rentSummary(id), policyConsent: pendingPolicyConsent(await getSettings(), policiesAcceptedVersion), workspace: await residentWorkspace(), mustSetPassword: !passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, photoVersion: photoVersion(profilePhotoUpdatedAt) })
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
