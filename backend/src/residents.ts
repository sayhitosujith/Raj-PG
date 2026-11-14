import { AadharVerificationStatus, Diet, MemberTier, Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { createAccessKey, hashAccessKey, hashPassword, isAcceptablePassword, isValidAccessKey, passwordRequirement } from './credentials.js'
import { parseDateOnly, propertyNow } from './dates.js'
import { findDuplicate } from './duplicates.js'
import { parseStudentIdCard, studentIdCardWrite } from './studentId.js'
import { findExpiredDocument, sendDocument, hasCompleteIdentity, identityDocumentName, identityWrite, indianNationality, isIndian, parseIdentityFields, type IdentityFields, type IdentityInput } from './identityDocuments.js'
import { prisma, withDatabaseRetry } from './db.js'
import { roomBedsSelect } from './occupancy.js'
import { findProfilePhotoProblem, photoVersion, sendProfilePhoto } from './photo.js'
import { rentFor, residentRentWrite } from './propertyRent.js'
import { rentStatus } from './rent.js'
import { getSettings, rentRulesOf, type RentRules } from './settings.js'
import { findInvalidField, pickTextFields, toResidentWrite, type TextField } from './residentFields.js'
import { isLockedOut, isRentLocked } from './rentLock.js'
import { closeAccount } from './accountDeletion.js'
import type { AuthContext } from './auth.js'
import { createUniqueDoorPin, syncDoorAccess } from './doorAccess.js'
import { BedUnavailableError, claimBed, lockRoom, parseBedNumber } from './beds.js'
import { computeExitDues, dailyRatesOf, type DailyRates } from './exits.js'
import { notifyRegistrationLink, notifyResidentCredentials } from './notifications.js'
import { newRegistrationLink, registrationUrl } from './selfRegistration.js'
import { residentWhere, staffAccess } from './staffAccess.js'

// Omits the access key hash (never leaves the server) and the document data URLs (up to 2 MB
// each; served on demand by GET /api/residents/:id/aadhar-card, /passport-scan and /student-id-card instead).
const residentSummaryQuery = { omit: { accessKeyHash: true, aadharCardUrl: true, passportScanUrl: true, studentIdCardUrl: true, profilePhotoUrl: true }, include: { room: { include: { property: { include: { sharingPrices: true } } } }, rentConcessions: { where: { status: 'ACTIVE' }, orderBy: { month: 'asc' }, select: { id: true, month: true, percent: true, reason: true } }, rentPayments: { orderBy: { month: 'desc' }, select: { id: true, month: true, amount: true, paidAt: true, razorpayPaymentId: true } } } } satisfies Prisma.ResidentDefaultArgs
const hasAadharCardWhere = { AND: [{ aadharCardUrl: { not: null } }, { aadharCardUrl: { not: '' } }] } satisfies Prisma.ResidentWhereInput
const hasPassportScanWhere = { AND: [{ passportScanUrl: { not: null } }, { passportScanUrl: { not: '' } }] } satisfies Prisma.ResidentWhereInput
const hasStudentIdCardWhere = { AND: [{ studentIdCardUrl: { not: null } }, { studentIdCardUrl: { not: '' } }] } satisfies Prisma.ResidentWhereInput
const noCredentialsWhere = { passwordHash: null, accessKeyHash: null } satisfies Prisma.ResidentWhereInput
type ResidentBody = Partial<Record<TextField | 'propertyId' | 'roomNumber' | 'accessKey' | 'joinedAt' | 'rentAccessUntil', string>> & IdentityInput & { studentIdCardUrl?: unknown; bedNumber?: unknown; sendCredentials?: boolean; active?: boolean; profilePhoto?: string | null; monthlyRent?: unknown; foodOpted?: unknown; diet?: unknown; memberTier?: unknown; whatsappOptIn?: unknown; emailOptIn?: unknown }

/**
 * Sends the sign-in details and returns the channels that delivered. A messaging outage must never
 * undo the save, so failures come back as an empty list and the owner shares the key by hand.
 */
async function sendCredentials(residentId: string, accessKey: string) {
  try {
    const result = await notifyResidentCredentials(residentId, accessKey)
    return (Object.keys(result) as Array<keyof typeof result>).filter((channel) => result[channel] === 'sent')
  } catch (error) {
    console.error('Sending login details failed:', error)
    return []
  }
}

class RoomUnavailableError extends Error {}
// Another active resident or a super admin already has one of these identifying details.
class DuplicateError extends Error {}
// Bad input found inside a transaction (rent rules, expired documents), answered with a 400.
class InputError extends Error {}

// `needsNewAccessKey`: no password and no access key (cleared after an overdue-rent lockout), looked up
// separately because the summary query never loads the credential hashes.
function toResidentSummary(resident: Prisma.ResidentGetPayload<typeof residentSummaryQuery>, documents: DocumentsOnFile, rules: RentRules, needsNewAccessKey: boolean, rates: DailyRates) {
  const { nationality, passportNumber, passportExpiry, visaNumber, visaType, visaExpiry } = resident
  const { approvalPending, id, name, phone, email, aadharNumber, permanentAddress, emergencyContactName, emergencyContactRelation, emergencyContactPhone, vehicleType, vehicleNumber, occupation, active, createdAt, joinedAt, passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, aadharReviewedAt, aadharReviewedByName, registrationTokenHash, registrationSentAt, registrationExpiresAt, registrationSubmittedAt, profilePhotoUpdatedAt, foodOpted, diet, memberTier, whatsappOptIn, emailOptIn, foodRequestedAt, doorAccessKey, doorAccessKeyRevokedAt, room, rentPayments } = resident
  // Status needs every paid month; the row only shows the latest few, with Undo.
  const paidMonths = rentPayments.map((payment) => payment.month)
  const rent = { ...rentStatus(resident, paidMonths, rules), payments: rentPayments.slice(0, 6) }
  return { rent, approvalPending, photoVersion: photoVersion(profilePhotoUpdatedAt), id, name, phone, email, nationality, aadharNumber, passportNumber, passportExpiry, visaNumber, visaType, visaExpiry, permanentAddress, emergencyContactName, emergencyContactRelation, emergencyContactPhone, vehicleType, vehicleNumber, occupation, active, createdAt, joinedAt, aadharStatus, aadharRejectionReason, aadharSubmittedAt, aadharReviewedAt, aadharReviewedByName, ...documents, registration: registrationSentAt ? { status: registrationTokenHash ? 'INVITED' : 'SUBMITTED', sentAt: registrationSentAt, expiresAt: registrationExpiresAt, submittedAt: registrationSubmittedAt } : null, hasPassword: Boolean(passwordHash), needsNewAccessKey, exitDues: resident.exitStatus === 'PENDING' || resident.exitStatus === 'APPROVED' ? computeExitDues(resident, rentPayments, rules, rates) : null, exitStatus: resident.exitStatus, exitDate: resident.exitDate, exitReason: resident.exitReason, movedOutAt: resident.movedOutAt, deletionRequestedAt: resident.deletionRequestedAt, deletedAt: resident.deletedAt, deletedByName: resident.deletedByName, rentAccessUntil: resident.rentAccessUntil, rentLocked: isRentLocked(resident, paidMonths, rules), doorAccessKey, doorAccessKeyRevokedAt, foodOpted, diet, memberTier, whatsappOptIn, emailOptIn, foodRequestedAt, // A moved-out resident has no room: their old place comes from movedOutFrom instead.
    // Active rent concessions (e.g. referral rewards), for the owner's rent panel, where each can be cancelled.
    rentConcessions: resident.rentConcessions,
    // Their bed in the room (1 to its beds); null only before a room is set or after moving out.
    bedNumber: resident.bedNumber,
    rentFromProperty: Boolean(room && rentFor(room.property, room.beds, true) !== null), room: room?.number ?? '—', propertyId: room?.propertyId ?? '', property: room?.property.name ?? resident.movedOutFrom ?? 'Moved out', location: room?.property.location ?? '', movedOutFrom: resident.movedOutFrom }
}

type DocumentsOnFile = { hasAadharCard: boolean; hasPassportScan: boolean; hasStudentIdCard: boolean }

// Counted rather than selected, so checking for an upload never loads the 2 MB data URL.
async function findDocumentsOnFile(client: Prisma.TransactionClient, id: string): Promise<DocumentsOnFile> {
  const [aadharCards, passportScans, studentIdCards] = await Promise.all([
    client.resident.count({ where: { id, ...hasAadharCardWhere } }),
    client.resident.count({ where: { id, ...hasPassportScanWhere } }),
    client.resident.count({ where: { id, ...hasStudentIdCardWhere } }),
  ])
  return { hasAadharCard: aadharCards > 0, hasPassportScan: passportScans > 0, hasStudentIdCard: studentIdCards > 0 }
}

async function findResidentSummary(id: string) {
  const [resident, documents, keyless] = await Promise.all([
    prisma.resident.findUniqueOrThrow({ where: { id }, ...residentSummaryQuery }),
    findDocumentsOnFile(prisma, id),
    prisma.resident.count({ where: { id, ...noCredentialsWhere } }),
  ])
  const settings = await getSettings()
  return toResidentSummary(resident, documents, rentRulesOf(settings), keyless > 0, dailyRatesOf(settings))
}

const resetVerification = { aadharStatus: AadharVerificationStatus.NOT_SUBMITTED, aadharRejectionReason: null, aadharSubmittedAt: null, aadharReviewedAt: null, aadharReviewedByName: null }
const queueForReview = () => ({ aadharStatus: AadharVerificationStatus.PENDING, aadharSubmittedAt: new Date() })

/** Validates the identity fields of a create or update body, or returns why they are invalid. */
function parseResidentIdentity(body: ResidentBody): { fields: IdentityFields } | { error: string } {
  const parsed = parseIdentityFields(body)
  return parsed.ok ? { fields: parsed.fields } : { error: parsed.error }
}

/**
 * Reserves a bed in one of the owner's rooms for a resident: in the room with that number, or without
 * a number in the lowest-numbered room with a free bed. Rooms are never created here; the owner
 * defines them under Properties, so a typo can never invent a room.
 */
async function claimRoom(transaction: Prisma.TransactionClient, propertyId: string, roomNumber?: string) {
  // Reserved beds are not free: a room whose only free beds are reserved counts as full.
  const rooms = await transaction.room.findMany({ where: { propertyId, ...(roomNumber ? { number: roomNumber } : {}) }, select: { id: true, number: true, beds: true, _count: { select: { residents: true, reservations: true } } }, orderBy: { number: 'asc' } })
  const freeRoom = rooms.find((room) => room._count.residents + room._count.reservations < room.beds)
  if (freeRoom) {
    // Lock the room and count again: two residents saved at the same moment must not both take its last bed.
    await lockRoom(transaction, freeRoom.id)
    const [living, held] = await Promise.all([transaction.resident.count({ where: { roomId: freeRoom.id } }), transaction.bedReservation.count({ where: { roomId: freeRoom.id } })])
    if (living + held < freeRoom.beds) return freeRoom
    throw new RoomUnavailableError(`The last bed in room ${freeRoom.number} was just taken. Choose another room.`)
  }
  if (roomNumber && rooms.length) throw new RoomUnavailableError(`Room ${roomNumber} is full.`)
  throw new RoomUnavailableError(roomNumber ? `Room ${roomNumber} does not exist in this property. Add it under Properties, then Rooms.` : 'This property has no free beds. Add rooms or beds under Properties, then Rooms.')
}

/**
 * The bed a resident has after an edit. Moving room: the bed asked for in the new room, or its next free
 * one. Same room: their bed unless another is asked for (blank also picks the next free one), or a bed is
 * given to someone who has none yet. No room: no bed.
 */
async function bedAfterEdit(transaction: Prisma.TransactionClient, edit: { newRoom: { id: string; number: string; beds: number } | null; roomId: string | null; residentId: string; currentBed: number | null; requested: { bed: number | null } | null }) {
  if (edit.newRoom) return claimBed(transaction, edit.newRoom, edit.requested?.bed ?? null, edit.residentId)
  if (!edit.roomId) return null
  const isChanging = edit.requested !== null && edit.requested.bed !== edit.currentBed
  if (!isChanging && edit.currentBed !== null) return edit.currentBed
  await lockRoom(transaction, edit.roomId)
  const room = await transaction.room.findUniqueOrThrow({ where: { id: edit.roomId }, select: { id: true, number: true, beds: true } })
  return claimBed(transaction, room, edit.requested?.bed ?? null, edit.residentId)
}

/**
 * Owner-supplied photo change: undefined leaves it alone, null removes it, a data URL replaces it.
 * Returns the Prisma fields to write, or an error message for a bad upload.
 */
/**
 * The diet sent with a resident: "VEG" or "NON_VEG"; null or "" clears it back to Not set; absent
 * leaves it as it is (an edit that does not touch it).
 */
function parseDiet(value: unknown): { data: { diet?: Diet | null } } | { error: string } {
  if (value === undefined) return { data: {} }
  if (value === null || value === '') return { data: { diet: null } }
  return value === Diet.VEG || value === Diet.NON_VEG ? { data: { diet: value } } : { error: 'Diet must be veg or non-veg.' }
}

/** The membership tier sent with a resident; absent leaves it as it is (create then uses the default). */
function parseMemberTier(value: unknown): { data: { memberTier?: MemberTier } } | { error: string } {
  if (value === undefined) return { data: {} }
  return Object.values(MemberTier).includes(value as MemberTier) ? { data: { memberTier: value as MemberTier } } : { error: 'Member tier must be Silver, Gold or Pearl.' }
}

function parseProfilePhoto(value: ResidentBody['profilePhoto']): { data: { profilePhotoUrl?: string | null; profilePhotoUpdatedAt?: Date | null } } | { error: string } {
  if (value === undefined) return { data: {} }
  if (value === null) return { data: { profilePhotoUrl: null, profilePhotoUpdatedAt: null } }
  const problem = findProfilePhotoProblem(value)
  return problem ? { error: problem } : { data: { profilePhotoUrl: value, profilePhotoUpdatedAt: new Date() } }
}

function respondToWriteError(response: Response, error: unknown, fallback: string) {
  if (error instanceof RoomUnavailableError || error instanceof DuplicateError || error instanceof BedUnavailableError) { response.status(409).json({ error: error.message }); return }
  // The (roomId, bedNumber) unique index: another save took the bed between our check and the write.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target ?? '').includes('bedNumber')) { response.status(409).json({ error: 'That bed was just taken. Choose another bed, or leave it blank for the next free one.' }); return }
  if (error instanceof InputError) { response.status(400).json({ error: error.message }); return }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { response.status(400).json({ error: 'Property was not found.' }); return }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Resident was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Resident management routes; must be mounted behind the super admin guard. */
export const residentRouter = Router()

// Owner summaries for the residents matching `where`, newest first by `orderBy`.
async function listResidentSummaries(where: Prisma.ResidentWhereInput, orderBy: Prisma.ResidentOrderByWithRelationInput) {
  const [residents, withCards, withScans, withStudentIds, withoutCredentials] = await withDatabaseRetry(() => Promise.all([
    prisma.resident.findMany({ ...residentSummaryQuery, where, orderBy }),
    prisma.resident.findMany({ where: { AND: [where, hasAadharCardWhere] }, select: { id: true } }),
    prisma.resident.findMany({ where: { AND: [where, hasPassportScanWhere] }, select: { id: true } }),
    prisma.resident.findMany({ where: { AND: [where, hasStudentIdCardWhere] }, select: { id: true } }),
    prisma.resident.findMany({ where: { AND: [where, noCredentialsWhere] }, select: { id: true } }),
  ]))
  const cardIds = new Set(withCards.map(({ id }) => id))
  const scanIds = new Set(withScans.map(({ id }) => id))
  const studentIdIds = new Set(withStudentIds.map(({ id }) => id))
  const keylessIds = new Set(withoutCredentials.map(({ id }) => id))
  const settings = await getSettings()
  const rules = rentRulesOf(settings)
  const rates = dailyRatesOf(settings)
  return residents.map((resident) => toResidentSummary(resident, { hasAadharCard: cardIds.has(resident.id), hasPassportScan: scanIds.has(resident.id), hasStudentIdCard: studentIdIds.has(resident.id) }, rules, keylessIds.has(resident.id), rates))
}

// Everyone except accounts closed at the resident's request, which live on the Deleted records page.
residentRouter.get('/residents', async (_request, response) => {
  if (!process.env.DATABASE_URL) { response.json([]); return }
  try {
    // Admins see the residents of their properties (moved-out residents have no room, so only super admins see them).
    response.json(await listResidentSummaries({ deletedAt: null, ...residentWhere(staffAccess(response)) }, { createdAt: 'desc' }))
  } catch (error) {
    console.error('Resident query failed:', error)
    response.status(503).json({ error: 'Residents could not be loaded.' })
  }
})

// Accounts closed at the resident's request, with every detail kept, most recently closed first.
residentRouter.get('/residents/deleted', async (_request, response) => {
  if (!process.env.DATABASE_URL) { response.json([]); return }
  try {
    response.json(await listResidentSummaries({ deletedAt: { not: null } }, { deletedAt: 'desc' }))
  } catch (error) {
    console.error('Deleted records query failed:', error)
    response.status(503).json({ error: 'Deleted records could not be loaded.' })
  }
})

residentRouter.get('/residents/access-key', (_request, response) => {
  response.json({ accessKey: createAccessKey() })
})

residentRouter.get('/residents/:id/aadhar-card', async (request, response) => {
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { aadharCardUrl: true } })
    sendDocument(response, resident?.aadharCardUrl, 'Aadhaar card')
  } catch (error) {
    console.error('Aadhaar card lookup failed:', error)
    response.status(503).json({ error: 'Aadhaar card could not be loaded.' })
  }
})

residentRouter.get('/residents/:id/passport-scan', async (request, response) => {
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { passportScanUrl: true } })
    sendDocument(response, resident?.passportScanUrl, 'Passport scan')
  } catch (error) {
    console.error('Passport scan lookup failed:', error)
    response.status(503).json({ error: 'Passport scan could not be loaded.' })
  }
})

residentRouter.get('/residents/:id/student-id-card', async (request, response) => {
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { studentIdCardUrl: true } })
    sendDocument(response, resident?.studentIdCardUrl, 'Student ID card')
  } catch (error) {
    console.error('Student ID card lookup failed:', error)
    response.status(503).json({ error: 'Student ID card could not be loaded.' })
  }
})

residentRouter.get('/residents/:id/photo', async (request, response) => {
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { profilePhotoUrl: true } })
    sendProfilePhoto(response, resident?.profilePhotoUrl)
  } catch (error) {
    console.error('Profile photo lookup failed:', error)
    response.status(503).json({ error: 'Profile photo could not be loaded.' })
  }
})

residentRouter.post('/residents', async (request, response) => {
  const body = request.body as ResidentBody
  const data = pickTextFields(body)
  if (!data.name || !body.propertyId) { response.status(400).json({ error: 'Name and property are required.' }); return }
  if (!data.occupation) { response.status(400).json({ error: 'Choose the occupation.' }); return }
  const invalidField = findInvalidField(data)
  if (invalidField) { response.status(400).json({ error: invalidField }); return }
  const studentIdCard = parseStudentIdCard(body.studentIdCardUrl)
  if ('error' in studentIdCard) { response.status(400).json({ error: studentIdCard.error }); return }
  const studentId = studentIdCardWrite(data.occupation, studentIdCard.card, false)
  if ('error' in studentId) { response.status(400).json({ error: studentId.error }); return }
  const identity = parseResidentIdentity(body)
  if ('error' in identity) { response.status(400).json({ error: identity.error }); return }
  const expired = findExpiredDocument(identity.fields)
  if (expired) { response.status(400).json({ error: expired }); return }
  const photo = parseProfilePhoto(body.profilePhoto)
  if ('error' in photo) { response.status(400).json({ error: photo.error }); return }
  if (body.foodOpted !== undefined && typeof body.foodOpted !== 'boolean') { response.status(400).json({ error: 'Food plan must be true or false.' }); return }
  const diet = parseDiet(body.diet)
  if ('error' in diet) { response.status(400).json({ error: diet.error }); return }
  const memberTier = parseMemberTier(body.memberTier)
  if ('error' in memberTier) { response.status(400).json({ error: memberTier.error }); return }
  if (body.whatsappOptIn !== undefined && typeof body.whatsappOptIn !== 'boolean') { response.status(400).json({ error: 'WhatsApp updates must be true or false.' }); return }
  if (body.emailOptIn !== undefined && typeof body.emailOptIn !== 'boolean') { response.status(400).json({ error: 'Email updates must be true or false.' }); return }
  const foodOpted = body.foodOpted ?? true
  const nationality = identity.fields.nationality ?? indianNationality
  if (body.accessKey && !isValidAccessKey(body.accessKey)) { response.status(400).json({ error: 'Access key is not in the generated format.' }); return }
  const joinedAt = parseDateOnly(body.joinedAt)
  if (joinedAt === null) { response.status(400).json({ error: 'Joining date must be a valid date.' }); return }
  const bed = parseBedNumber(body.bedNumber)
  if ('error' in bed) { response.status(400).json({ error: bed.error }); return }
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Resident creation requires a database connection.' }); return }
  const { name } = data
  const { propertyId } = body
  try {
    const accessKey = body.accessKey || createAccessKey()
    const residentId = await prisma.$transaction(async (transaction) => {
      const duplicate = await findDuplicate(transaction, { email: data.email, phone: data.phone, ...(isIndian(nationality) ? { aadharNumber: identity.fields.aadharNumber } : { passportNumber: identity.fields.passportNumber }) })
      if (duplicate) throw new DuplicateError(duplicate)
      const room = await claimRoom(transaction, propertyId, body.roomNumber?.trim())
      const bedNumber = await claimBed(transaction, room, bed.bed)
      const rent = await residentRentWrite(transaction, { roomId: room.id, foodOpted, trackedFrom: null, typedRent: body.monthlyRent })
      if ('error' in rent) throw new InputError(rent.error)
      const readyForReview = hasCompleteIdentity({ ...identity.fields, nationality, hasAadharCard: Boolean(identity.fields.aadharCardUrl), hasPassportScan: Boolean(identity.fields.passportScanUrl) })
      const resident = await transaction.resident.create({ data: { approvalPending: !staffAccess(response).isOwner, ...toResidentWrite(data), ...studentId.data, nationality, ...identityWrite(nationality, identity.fields), ...photo.data, ...rent.data, ...diet.data, ...memberTier.data, foodOpted, name, ...(typeof body.whatsappOptIn === 'boolean' ? { whatsappOptIn: body.whatsappOptIn } : {}), ...(typeof body.emailOptIn === 'boolean' ? { emailOptIn: body.emailOptIn } : {}), ...(joinedAt ? { joinedAt } : {}), ...(readyForReview ? queueForReview() : {}), accessKeyHash: hashAccessKey(accessKey), roomId: room.id, bedNumber } })
      return resident.id
    })
    response.status(201).json({ ...await findResidentSummary(residentId), accessKey, ...(body.sendCredentials === true ? { credentialsSent: await sendCredentials(residentId, accessKey) } : {}) })
  } catch (error) {
    respondToWriteError(response, error, 'Resident could not be saved.')
  }
})

residentRouter.put('/residents/:id', async (request, response) => {
  const { id } = request.params
  const body = request.body as ResidentBody
  const data = pickTextFields(body)
  const invalidField = findInvalidField(data)
  if (invalidField) { response.status(400).json({ error: invalidField }); return }
  const studentIdCard = parseStudentIdCard(body.studentIdCardUrl)
  if ('error' in studentIdCard) { response.status(400).json({ error: studentIdCard.error }); return }
  const identity = parseResidentIdentity(body)
  if ('error' in identity) { response.status(400).json({ error: identity.error }); return }
  const photo = parseProfilePhoto(body.profilePhoto)
  if ('error' in photo) { response.status(400).json({ error: photo.error }); return }
  if (body.active !== undefined && typeof body.active !== 'boolean') { response.status(400).json({ error: 'Status must be true or false.' }); return }
  if (body.foodOpted !== undefined && typeof body.foodOpted !== 'boolean') { response.status(400).json({ error: 'Food plan must be true or false.' }); return }
  const diet = parseDiet(body.diet)
  if ('error' in diet) { response.status(400).json({ error: diet.error }); return }
  const memberTier = parseMemberTier(body.memberTier)
  if ('error' in memberTier) { response.status(400).json({ error: memberTier.error }); return }
  if (body.whatsappOptIn !== undefined && typeof body.whatsappOptIn !== 'boolean') { response.status(400).json({ error: 'WhatsApp updates must be true or false.' }); return }
  if (body.emailOptIn !== undefined && typeof body.emailOptIn !== 'boolean') { response.status(400).json({ error: 'Email updates must be true or false.' }); return }
  const joinedAt = parseDateOnly(body.joinedAt)
  if (joinedAt === null) { response.status(400).json({ error: 'Joining date must be a valid date.' }); return }
  // Blank clears the override; absent leaves it alone.
  const rentAccessUntil = body.rentAccessUntil === '' ? null : parseDateOnly(body.rentAccessUntil)
  if (body.rentAccessUntil && rentAccessUntil === null) { response.status(400).json({ error: 'Allow access until must be a valid date.' }); return }
  // Absent keeps their bed; a number asks for that bed; blank picks the next free one.
  const bed = body.bedNumber === undefined ? null : parseBedNumber(body.bedNumber)
  if (bed && 'error' in bed) { response.status(400).json({ error: bed.error }); return }
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Resident updates require a database connection.' }); return }
  try {
    // A closed account is a record, not a resident: editing it could move it back into a room or change what was kept.
    const closed = await prisma.resident.findUnique({ where: { id }, select: { deletedAt: true } })
    if (closed?.deletedAt) { response.status(409).json({ error: "This account was closed at the resident's request and is kept as a record; it cannot be edited." }); return }
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.resident.findUniqueOrThrow({ where: { id }, select: { roomId: true, bedNumber: true, active: true, email: true, phone: true, permanentAddress: true, aadharStatus: true, nationality: true, aadharNumber: true, passportNumber: true, passportExpiry: true, visaNumber: true, visaType: true, visaExpiry: true, rentTrackedFrom: true, foodOpted: true, foodRequestedAt: true, room: { select: { propertyId: true, number: true } } } })
      const expired = findExpiredDocument(identity.fields, current)
      if (expired) throw new InputError(expired)
      const nationality = identity.fields.nationality ?? current.nationality
      // Verification covered the old nationality's document; a different document needs a fresh review.
      const isNationalityChange = nationality !== current.nationality
      // The saved values (current plus changes) must be free whenever the resident will be active,
      // which also catches a clash when an inactive resident is reactivated.
      if (body.active ?? current.active) {
        const keptDocument = (value: string | null) => (isNationalityChange ? null : value)
        const duplicate = await findDuplicate(transaction, {
          email: data.email ?? current.email,
          phone: data.phone ?? current.phone,
          ...(isIndian(nationality) ? { aadharNumber: identity.fields.aadharNumber ?? keptDocument(current.aadharNumber) } : { passportNumber: identity.fields.passportNumber ?? keptDocument(current.passportNumber) }),
        }, { residentId: id })
        if (duplicate) throw new DuplicateError(duplicate)
      }
      const foodOpted = (body.foodOpted as boolean | undefined) ?? current.foodOpted
      // A moved-out resident has no room. Editing them while they stay inactive leaves it that way;
      // setting them Active again moves them back in, into the chosen (or first free) room.
      const isReturning = !current.room && body.active === true
      const hasRoomAfter = Boolean(current.room) || isReturning
      const targetPropertyId = body.propertyId || current.room?.propertyId || ''
      if (isReturning && !targetPropertyId) throw new InputError('Choose a property to move them back in.')
      const targetRoomNumber = body.roomNumber?.trim() || current.room?.number
      const isMoving = isReturning || (Boolean(current.room) && (targetPropertyId !== current.room?.propertyId || targetRoomNumber !== current.room?.number))
      const newRoom = isMoving ? await claimRoom(transaction, targetPropertyId, targetRoomNumber) : null
      const roomId = newRoom ? newRoom.id : current.roomId
      const bedNumber = await bedAfterEdit(transaction, { newRoom, roomId, residentId: id, currentBed: current.bedNumber, requested: bed })
      // After the room is settled: its sharing type can decide the rent.
      const rent = hasRoomAfter && roomId ? await residentRentWrite(transaction, { roomId, foodOpted, trackedFrom: current.rentTrackedFrom, typedRent: body.monthlyRent }) : { data: {} }
      if ('error' in rent) throw new InputError(rent.error)
      const returnedHome = isReturning ? { movedOutFrom: null, movedOutAt: null, exitStatus: null, exitDate: null, exitReason: null, exitRequestedAt: null } : {}
      // Completing the details on an unsubmitted resident queues them for review; it never verifies.
      const onFile = await findDocumentsOnFile(transaction, id)
      // Only the full form sends the occupation, so other partial updates (approving food, say) never ask for a card.
      const studentId = data.occupation === undefined ? { data: {} } : studentIdCardWrite(data.occupation, studentIdCard.card, onFile.hasStudentIdCard)
      if ('error' in studentId) throw new InputError(studentId.error)
      const isComplete = hasCompleteIdentity({ ...current, ...identity.fields, nationality, hasAadharCard: Boolean(identity.fields.aadharCardUrl) || (onFile.hasAadharCard && !isNationalityChange), hasPassportScan: Boolean(identity.fields.passportScanUrl) || (onFile.hasPassportScan && !isNationalityChange) })
      const isUnsubmitted = isNationalityChange || current.aadharStatus === AadharVerificationStatus.NOT_SUBMITTED
      const verification = isUnsubmitted && isComplete ? { ...resetVerification, ...queueForReview() } : isNationalityChange ? resetVerification : {}
      // An address the owner types is theirs to vouch for, so it is shown as verified again.
      const addressCheck = data.permanentAddress !== undefined && data.permanentAddress !== (current.permanentAddress ?? '') ? { addressVerified: true } : {}
      await transaction.resident.update({ where: { id }, data: { ...toResidentWrite(data), ...studentId.data, ...addressCheck, ...returnedHome, ...(rentAccessUntil !== undefined ? { rentAccessUntil } : {}), nationality, ...identityWrite(nationality, identity.fields), ...verification, ...photo.data, ...rent.data, ...diet.data, ...memberTier.data, foodOpted, ...(typeof body.whatsappOptIn === 'boolean' ? { whatsappOptIn: body.whatsappOptIn } : {}), ...(typeof body.emailOptIn === 'boolean' ? { emailOptIn: body.emailOptIn } : {}), ...(foodOpted ? { foodRequestedAt: null } : {}), ...(foodOpted && current.foodRequestedAt && !current.foodOpted ? { foodDecidedAt: new Date(), foodApproved: true } : {}), ...(body.active !== undefined ? { active: body.active } : {}), ...(joinedAt ? { joinedAt } : {}), roomId, bedNumber } })
      // A deactivated resident must lose app access immediately, not when their session expires.
      if (body.active === false) await transaction.session.deleteMany({ where: { residentId: id } })
      // A door PIN follows the resident to another property's locks; a move within the property changes nothing.
      if (isMoving) await syncDoorAccess(transaction, { residentId: id }, 'Moved to another room')
    })
    response.json(await findResidentSummary(id))
  } catch (error) {
    respondToWriteError(response, error, 'Resident could not be updated.')
  }
})

// Declines a resident's request to join the food plan; approving is a normal update with foodOpted: true.
residentRouter.delete('/residents/:id/food-request', async (request, response) => {
  try {
    await prisma.resident.update({ where: { id: request.params.id }, data: { foodRequestedAt: null, foodDecidedAt: new Date(), foodApproved: false } })
    response.json(await findResidentSummary(request.params.id))
  } catch (error) {
    respondToWriteError(response, error, 'The food request could not be declined.')
  }
})

// The key is only stored hashed, so "editing" it means issuing a new one. This is also the
// forgotten-password path: the resident's password is cleared so the new key works for sign-in.
// With { send: true } the new key is also sent to the resident by email and WhatsApp.
residentRouter.post('/residents/:id/access-key', async (request, response) => {
  const { id } = request.params
  const accessKey = createAccessKey()
  try {
    // Renewal: a new key for someone whose approved move-out date has passed means they are staying,
    // so that move-out is cleared (otherwise the ended stay would sign them straight out again).
    const current = await prisma.resident.findUniqueOrThrow({ where: { id }, select: { exitStatus: true, exitDate: true, movedOutAt: true, deletedAt: true } })
    if (current.deletedAt) { response.status(409).json({ error: "This account was closed at the resident's request, so it cannot get a new access key." }); return }
    const isRenewal = current.exitStatus === 'APPROVED' && !current.movedOutAt && Boolean(current.exitDate && current.exitDate.toISOString().slice(0, 10) < propertyNow().date)
    const renewal = isRenewal ? { exitStatus: null, exitDate: null, exitReason: null, exitRequestedAt: null } : {}
    await prisma.$transaction([
      prisma.resident.update({ where: { id }, data: { accessKeyHash: hashAccessKey(accessKey), passwordHash: null, passkeys: { deleteMany: {} }, ...renewal } }),
      prisma.session.deleteMany({ where: { residentId: id } }),
    ])
    const isSending = (request.body as { send?: unknown } | undefined)?.send === true
    response.json({ accessKey, ...(isSending ? { credentialsSent: await sendCredentials(id, accessKey) } : {}) })
  } catch (error) {
    respondToWriteError(response, error, 'Access key could not be reset.')
  }
})

// Lets the owner choose a resident's password so they can tell the resident what it is; the
// password itself is stored only as a hash. Retires the access key and signs the resident out.
// Door lock PIN: POST issues a new one (replacing any old one, which the owner then reprograms), DELETE
// removes it. Super admins only (see staffGuard). Anyone who has left gets no key. Each change also queues
// the matching PIN changes for the owner to make on each lock (see doorAccess.ts).
residentRouter.post('/residents/:id/door-key', async (request, response) => {
  try {
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: request.params.id }, select: { deletedAt: true, movedOutAt: true } })
    if (resident.deletedAt || resident.movedOutAt) { response.status(409).json({ error: 'This resident no longer lives here, so they cannot get a door access key.' }); return }
    // The daily run would take it away again; the owner records the rent or allows access until a date first.
    if (await isLockedOut(request.params.id)) { response.status(409).json({ error: 'Rent is overdue, so door access is paused. Record the payment or allow access until a date first.' }); return }
    const settings = await getSettings()
    if (!settings.doorKeysEnabled) { response.status(409).json({ error: 'Door access keys are switched off in Settings → Smart lock.' }); return }
    const doorAccessKey = await prisma.$transaction(async (transaction) => {
      const pin = await createUniqueDoorPin(transaction, settings.doorPinLength)
      await transaction.resident.update({ where: { id: request.params.id }, data: { doorAccessKey: pin, doorAccessKeyRevokedAt: null } })
      await syncDoorAccess(transaction, { residentId: request.params.id }, 'New door access key')
      return pin
    })
    response.json({ doorAccessKey })
  } catch (error) {
    respondToWriteError(response, error, 'Door access key could not be saved.')
  }
})

residentRouter.delete('/residents/:id/door-key', async (request, response) => {
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.resident.update({ where: { id: request.params.id }, data: { doorAccessKey: null, doorAccessKeyRevokedAt: null } })
      await syncDoorAccess(transaction, { residentId: request.params.id }, 'Key removed by a super admin')
    })
    response.status(204).end()
  } catch (error) {
    respondToWriteError(response, error, 'Door access key could not be removed.')
  }
})

residentRouter.post('/residents/:id/password', async (request, response) => {
  const { id } = request.params
  const { password } = request.body as { password?: string }
  if (!isAcceptablePassword(password)) { response.status(400).json({ error: passwordRequirement }); return }
  try {
    await prisma.$transaction([
      prisma.resident.update({ where: { id }, data: { passwordHash: hashPassword(password), accessKeyHash: null } }),
      prisma.session.deleteMany({ where: { residentId: id } }),
    ])
    response.status(204).send()
  } catch (error) {
    respondToWriteError(response, error, 'Password could not be set.')
  }
})

const maxRejectionReasonLength = 300

// The owner's decision on a resident's identity documents (Aadhaar, or passport and visa). Approval
// needs every detail and the upload on file, because that is what the owner attests to having checked.
residentRouter.post('/residents/:id/aadhar-verification', async (request, response) => {
  const { id } = request.params
  const { decision, reason } = request.body as { decision?: string; reason?: string }
  if (decision !== 'approve' && decision !== 'reject') { response.status(400).json({ error: 'Decision must be approve or reject.' }); return }
  const trimmedReason = reason?.trim() ?? ''
  if (decision === 'reject' && !trimmedReason) { response.status(400).json({ error: 'Tell the resident why their details were rejected.' }); return }
  if (trimmedReason.length > maxRejectionReasonLength) { response.status(400).json({ error: `Keep the reason under ${maxRejectionReasonLength} characters.` }); return }
  try {
    const [resident, documents] = await Promise.all([
      prisma.resident.findUniqueOrThrow({ where: { id }, select: { nationality: true, aadharNumber: true, passportNumber: true, passportExpiry: true, visaNumber: true, visaType: true, visaExpiry: true } }),
      findDocumentsOnFile(prisma, id),
    ])
    if (decision === 'approve' && !hasCompleteIdentity({ ...resident, ...documents })) {
      const missing = identityDocumentName(resident.nationality) === 'Aadhaar' ? 'Both the Aadhaar number and the card' : 'The passport number, expiry and scan, and the visa number, type and expiry,'
      response.status(409).json({ error: `${missing} must be on file before approving.` }); return
    }
    const { userId } = response.locals.auth as AuthContext
    const reviewer = await prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } })
    const reviewed = { aadharReviewedAt: new Date(), aadharReviewedByName: reviewer?.name ?? null }
    await prisma.resident.update({ where: { id }, data: decision === 'approve'
      ? { aadharStatus: AadharVerificationStatus.VERIFIED, aadharRejectionReason: null, ...reviewed, addressVerified: true }
      : { aadharStatus: AadharVerificationStatus.REJECTED, aadharRejectionReason: trimmedReason, ...reviewed } })
    response.json(await findResidentSummary(id))
  } catch (error) {
    respondToWriteError(response, error, 'Verification could not be saved.')
  }
})

/** Erases a resident outright: a rejected addition, or a closed record the owner deletes for good. */
async function deleteResident(id: string) {
  await prisma.resident.delete({ where: { id } })
}

/**
 * Sends a resident's registration link on WhatsApp. A messaging failure never undoes the invite, so it comes
 * back as the outcome and the link itself, which staff share by hand when WhatsApp is off or fails.
 */
async function sendRegistrationLink(residentId: string, token: string, sentAt: Date) {
  const link = registrationUrl(token)
  try {
    return { registrationLink: link, whatsapp: await notifyRegistrationLink(residentId, link, sentAt) }
  } catch (error) {
    console.error('Sending the registration link failed:', error)
    return { registrationLink: link, whatsapp: 'failed' as const }
  }
}

// Self-registration (selfRegistration.ts): staff reserve a bed for a new resident and WhatsApp them a link to
// fill in their own details. The record waits for approval (approvalPending) from the start, so it cannot
// sign in or be approved until the resident has submitted and staff have reviewed it.
residentRouter.post('/residents/invite', async (request, response) => {
  const body = request.body as ResidentBody
  const data = pickTextFields({ name: body.name ?? '', phone: body.phone ?? '' })
  if (!data.name) { response.status(400).json({ error: 'Enter the resident\'s name.' }); return }
  if (!data.phone) { response.status(400).json({ error: 'Enter the WhatsApp number to send the link to.' }); return }
  const invalid = findInvalidField(data)
  if (invalid) { response.status(400).json({ error: invalid }); return }
  if (!body.propertyId) { response.status(400).json({ error: 'Choose the property.' }); return }
  if (body.foodOpted !== undefined && typeof body.foodOpted !== 'boolean') { response.status(400).json({ error: 'Food plan must be true or false.' }); return }
  const joinedAt = parseDateOnly(body.joinedAt)
  if (joinedAt === null) { response.status(400).json({ error: 'Joining date must be a valid date.' }); return }
  const bed = parseBedNumber(body.bedNumber)
  if ('error' in bed) { response.status(400).json({ error: bed.error }); return }
  const foodOpted = body.foodOpted ?? true
  const link = newRegistrationLink()
  const { propertyId } = body
  try {
    const residentId = await prisma.$transaction(async (transaction) => {
      const duplicate = await findDuplicate(transaction, { phone: data.phone })
      if (duplicate) throw new DuplicateError(duplicate)
      const room = await claimRoom(transaction, propertyId, body.roomNumber?.trim())
      const bedNumber = await claimBed(transaction, room, bed.bed)
      const rent = await residentRentWrite(transaction, { roomId: room.id, foodOpted, trackedFrom: null, typedRent: body.monthlyRent })
      if ('error' in rent) throw new InputError(rent.error)
      const resident = await transaction.resident.create({ data: { approvalPending: true, name: data.name as string, phone: data.phone, foodOpted, ...rent.data, ...(joinedAt ? { joinedAt } : {}), ...link.data, roomId: room.id, bedNumber } })
      return resident.id
    })
    response.status(201).json({ ...await findResidentSummary(residentId), ...await sendRegistrationLink(residentId, link.token, link.data.registrationSentAt) })
  } catch (error) {
    respondToWriteError(response, error, 'The registration link could not be created.')
  }
})

// A fresh link for a resident who has not submitted yet: the old one stops working.
residentRouter.post('/residents/:id/registration-link', async (request, response) => {
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { registrationTokenHash: true, deletedAt: true } })
    if (!resident || resident.deletedAt) { response.status(404).json({ error: 'Resident was not found.' }); return }
    if (!resident.registrationTokenHash) { response.status(409).json({ error: 'This resident has already submitted their registration.' }); return }
    const link = newRegistrationLink()
    await prisma.resident.update({ where: { id: request.params.id }, data: link.data })
    response.json({ ...await findResidentSummary(request.params.id), ...await sendRegistrationLink(request.params.id, link.token, link.data.registrationSentAt) })
  } catch (error) {
    respondToWriteError(response, error, 'The registration link could not be sent.')
  }
})

// A super admin's decision on a resident a receptionist added or invited: approve lets them sign in; reject
// removes them and frees the room, since they never became a resident. Super admins only (see staffGuard.ts).
residentRouter.post('/residents/:id/approval', async (request, response) => {
  const { approve } = request.body as { approve?: unknown }
  if (typeof approve !== 'boolean') { response.status(400).json({ error: 'Choose approve or reject.' }); return }
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { approvalPending: true, registrationTokenHash: true } })
    if (!resident?.approvalPending) { response.status(409).json({ error: 'This resident is not waiting for approval.' }); return }
    // An invited resident has no details yet; rejecting (withdrawing the invite) is still allowed.
    if (approve && resident.registrationTokenHash) { response.status(409).json({ error: 'They have not filled in the registration link yet. Approve once they submit it.' }); return }
    if (approve) {
      await prisma.resident.update({ where: { id: request.params.id }, data: { approvalPending: false } })
      response.json(await findResidentSummary(request.params.id))
    } else {
      await deleteResident(request.params.id)
      response.status(204).send()
    }
  } catch (error) {
    console.error('Resident approval failed:', error)
    response.status(503).json({ error: 'The decision could not be saved.' })
  }
})

// Removing a resident closes the account rather than erasing it, so the record (with who removed it)
// moves to Deleted records. Super admins only (see staffGuard.ts).
residentRouter.delete('/residents/:id', async (request, response) => {
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Resident deletion requires a database connection.' }); return }
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { deletedAt: true } })
    if (!resident) { response.status(404).json({ error: 'Resident was not found.' }); return }
    if (resident.deletedAt) { response.status(409).json({ error: 'This resident is already in Deleted records.' }); return }
    const { userId } = response.locals.auth as AuthContext
    const staff = await prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } })
    await closeAccount(request.params.id, staff?.name ?? 'A team member')
    response.status(204).send()
  } catch (error) {
    console.error('Resident removal failed:', error)
    response.status(503).json({ error: 'Resident could not be removed.' })
  }
})

// Deletes a record on the Deleted records page for good. Only closed accounts: a live resident is removed
// (and kept) first, so one click can never erase someone. Super admins only (see staffGuard.ts).
residentRouter.delete('/residents/:id/record', async (request, response) => {
  try {
    const { count } = await prisma.resident.deleteMany({ where: { id: request.params.id, deletedAt: { not: null } } })
    if (!count) { response.status(404).json({ error: 'That record was not found in Deleted records.' }); return }
    response.status(204).send()
  } catch (error) {
    console.error('Record deletion failed:', error)
    response.status(503).json({ error: 'The record could not be deleted.' })
  }
})
