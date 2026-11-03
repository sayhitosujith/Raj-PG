import { AadharVerificationStatus, Prisma } from '@prisma/client'
import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { hashPassword, isAcceptablePassword, passwordRequirement } from './credentials.js'
import { prisma } from './db.js'
import { findDuplicate } from './duplicates.js'
import { findExpiredDocument, hasCompleteIdentity, identityWrite, indianNationality, isIndian, parseIdentityFields, type IdentityInput } from './identityDocuments.js'
import { findProfilePhotoProblem } from './photo.js'
import { coverUrl } from './publicSite.js'
import { findInvalidField, pickTextFields, textFields, toResidentWrite, type TextField } from './residentFields.js'
import { getSettings } from './settings.js'
import { parseStudentIdCard, studentIdCardWrite } from './studentId.js'

/**
 * Self-registration: staff reserve a bed for a new resident and send them a link (POST /residents/invite in
 * residents.ts); the resident opens it on their phone and fills in their own details, ID document, live photo
 * and password. The record is approvalPending all along, so they cannot sign in until staff review and approve.
 * The link is a random token of which only the hash is stored; it works once and for {@link linkLifetimeDays} days.
 */

/** How long a registration link works. */
export const linkLifetimeDays = 7

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** A new link token, and the columns that make it the resident's current one (replacing any earlier link). */
export function newRegistrationLink() {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  return { token, data: { registrationTokenHash: hashToken(token), registrationSentAt: now, registrationExpiresAt: new Date(now.getTime() + linkLifetimeDays * 24 * 60 * 60_000), registrationSubmittedAt: null } }
}

/** The address the resident opens; the web app serves it at /register/<token>. */
export const registrationUrl = (token: string) => `${(process.env.APP_URL || 'https://raj-pg.netlify.app').replace(/\/$/, '')}/register/${token}`

// The resident an unexpired link belongs to, or null (unknown, used, expired, or the resident was removed).
async function findInvited(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null
  return prisma.resident.findFirst({
    where: { registrationTokenHash: hashToken(token), registrationExpiresAt: { gt: new Date() }, deletedAt: null },
    select: { id: true, name: true, phone: true, bedNumber: true, room: { select: { number: true, property: { select: { id: true, name: true, imageUrl: true } } } } },
  })
}

const goneMessage = 'This registration link has expired or was already used. Ask the reception to send a new one.'

/** Public routes for the link itself; mounted before the sign-in checks, since the resident has no account yet. */
export const selfRegistrationRouter = Router()

// What the registration page shows before the form: who it is for, the bed reserved for them and the property's image.
selfRegistrationRouter.get('/registration/:token', async (request, response) => {
  try {
    const resident = await findInvited(request.params.token)
    if (!resident) { response.status(410).json({ error: goneMessage }); return }
    const settings = await getSettings()
    const property = resident.room?.property
    response.json({ name: resident.name, phone: resident.phone, property: property?.name ?? null, propertyImage: property?.imageUrl ? coverUrl(property.id, property.imageUrl) : null, room: resident.room?.number ?? null, bed: resident.bedNumber, businessName: settings.businessName, defaultNationality: indianNationality })
  } catch (error) {
    console.error('Registration link lookup failed:', error)
    response.status(503).json({ error: 'Registration is temporarily unavailable.' })
  }
})

type RegistrationBody = Partial<Record<TextField, unknown>> & IdentityInput & { studentIdCardUrl?: unknown; profilePhoto?: unknown; password?: unknown }

// The resident's submission. Everything the owner's Add resident form requires is required here too, plus a
// live photo and a password; the phone stays the one the link was sent to. The ID joins the review queue.
selfRegistrationRouter.post('/registration/:token', async (request, response) => {
  const body = request.body as RegistrationBody
  // The phone is the WhatsApp number the link went to, so it is not taken from the form.
  const data = pickTextFields(Object.fromEntries(textFields.filter((field) => field !== 'phone').map((field) => [field, body[field] ?? ''])))
  if (!data.name) { response.status(400).json({ error: 'Enter your name.' }); return }
  if (!data.email) { response.status(400).json({ error: 'Enter your email address.' }); return }
  if (!data.permanentAddress) { response.status(400).json({ error: 'Enter your permanent address.' }); return }
  const invalid = findInvalidField(data)
  if (invalid) { response.status(400).json({ error: invalid }); return }
  const card = parseStudentIdCard(body.studentIdCardUrl)
  if ('error' in card) { response.status(400).json({ error: card.error }); return }
  const studentId = studentIdCardWrite(data.occupation ?? '', card.card, false)
  if ('error' in studentId) { response.status(400).json({ error: studentId.error }); return }
  const identity = parseIdentityFields(body)
  if (!identity.ok) { response.status(400).json({ error: identity.error }); return }
  const nationality = identity.fields.nationality ?? indianNationality
  if (!hasCompleteIdentity({ ...identity.fields, nationality, hasAadharCard: Boolean(identity.fields.aadharCardUrl), hasPassportScan: Boolean(identity.fields.passportScanUrl) })) {
    response.status(400).json({ error: isIndian(nationality) ? 'Enter your Aadhaar number and upload a photo or PDF of your Aadhaar card.' : 'Enter your passport and visa details and upload a photo or PDF of your passport photo page.' })
    return
  }
  const expired = findExpiredDocument(identity.fields)
  if (expired) { response.status(400).json({ error: expired }); return }
  const photoProblem = typeof body.profilePhoto === 'string' ? findProfilePhotoProblem(body.profilePhoto) : 'Take your profile photo with the camera.'
  if (photoProblem) { response.status(400).json({ error: photoProblem }); return }
  const password = typeof body.password === 'string' ? body.password : undefined
  if (!isAcceptablePassword(password)) { response.status(400).json({ error: passwordRequirement }); return }
  try {
    const resident = await findInvited(request.params.token)
    if (!resident) { response.status(410).json({ error: goneMessage }); return }
    // The resident is not told whose account holds a clashing detail, only that it is taken.
    const duplicate = await findDuplicate(prisma, { email: data.email, ...(isIndian(nationality) ? { aadharNumber: identity.fields.aadharNumber } : { passportNumber: identity.fields.passportNumber }) }, { residentId: resident.id }, { revealOwner: false })
    if (duplicate) { response.status(409).json({ error: duplicate }); return }
    const now = new Date()
    // Conditional on the token, so a double submit (or two tabs) saves once and the second gets "already used".
    const { count } = await prisma.resident.updateMany({
      where: { id: resident.id, registrationTokenHash: hashToken(request.params.token) },
      data: { ...toResidentWrite(data), ...studentId.data, nationality, ...identityWrite(nationality, identity.fields), aadharStatus: AadharVerificationStatus.PENDING, aadharSubmittedAt: now, profilePhotoUrl: body.profilePhoto as string, profilePhotoUpdatedAt: now, passwordHash: hashPassword(password), registrationTokenHash: null, registrationSubmittedAt: now },
    })
    if (!count) { response.status(410).json({ error: goneMessage }); return }
    response.status(204).send()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { response.status(409).json({ error: 'Those details are already registered to another account.' }); return }
    console.error('Registration submit failed:', error)
    response.status(503).json({ error: 'Your registration could not be saved. Try again.' })
  }
})
