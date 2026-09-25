import { AadharVerificationStatus, Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { createAccessKey, hashAccessKey, hashPassword, isAcceptablePassword, isValidAccessKey, passwordRequirement } from './credentials.js'
import { aadharCardDataUrlPattern, findAadharCardProblem, hasCompleteAadhar, isValidAadharNumber } from './aadhar.js'
import { parseDateOnly } from './dates.js'
import { prisma, withDatabaseRetry } from './db.js'
import { findProfilePhotoProblem, photoVersion, sendProfilePhoto } from './photo.js'
import { parseMonthlyRent, rentStatus } from './rent.js'

// Omits the access key hash (never leaves the server) and the Aadhaar card data URL (up to 2 MB
// each; served on demand by GET /api/residents/:id/aadhar-card instead).
const residentSummaryQuery = { omit: { accessKeyHash: true, aadharCardUrl: true, profilePhotoUrl: true }, include: { room: { include: { property: true } }, rentPayments: { orderBy: { month: 'desc' }, select: { id: true, month: true, amount: true, paidAt: true } } } } satisfies Prisma.ResidentDefaultArgs
const hasAadharCardWhere = { AND: [{ aadharCardUrl: { not: null } }, { aadharCardUrl: { not: '' } }] } satisfies Prisma.ResidentWhereInput
const textFields = ['name', 'phone', 'email', 'aadharNumber', 'permanentAddress', 'aadharCardUrl'] as const

type TextField = (typeof textFields)[number]
type ResidentBody = Partial<Record<TextField | 'propertyId' | 'roomNumber' | 'accessKey' | 'joinedAt', string>> & { active?: boolean; profilePhoto?: string | null; monthlyRent?: unknown }

class RoomOccupiedError extends Error {}
class RentInputError extends Error {}

function toResidentSummary(resident: Prisma.ResidentGetPayload<typeof residentSummaryQuery>, hasAadharCard: boolean) {
  const { id, name, phone, email, aadharNumber, permanentAddress, active, createdAt, joinedAt, passwordHash, aadharStatus, aadharRejectionReason, aadharSubmittedAt, aadharReviewedAt, profilePhotoUpdatedAt, room, rentPayments } = resident
  // Status needs every paid month; the row only shows the latest few, with Undo.
  const rent = { ...rentStatus(resident, rentPayments.map((payment) => payment.month)), payments: rentPayments.slice(0, 6) }
  return { rent, photoVersion: photoVersion(profilePhotoUpdatedAt), id, name, phone, email, aadharNumber, permanentAddress, active, createdAt, joinedAt, aadharStatus, aadharRejectionReason, aadharSubmittedAt, aadharReviewedAt, hasAadharCard, hasPassword: Boolean(passwordHash), room: room.number, propertyId: room.propertyId, property: room.property.name, location: room.property.location }
}

async function findResidentSummary(id: string) {
  const [resident, cardCount] = await Promise.all([
    prisma.resident.findUniqueOrThrow({ where: { id }, ...residentSummaryQuery }),
    prisma.resident.count({ where: { id, ...hasAadharCardWhere } }),
  ])
  return toResidentSummary(resident, cardCount > 0)
}

// Only fields present in the body are returned, so PUT can apply partial updates.
function pickTextFields(body: ResidentBody) {
  const data: Partial<Record<TextField, string>> = {}
  for (const field of textFields) {
    const value = body[field]
    if (typeof value === 'string') data[field] = value.trim()
  }
  return data
}

function findInvalidField(data: Partial<Record<TextField, string>>) {
  if (data.name !== undefined && !data.name) return 'Name is required.'
  if (data.aadharNumber && !isValidAadharNumber(data.aadharNumber)) return 'Aadhaar number must be 12 digits.'
  if (data.aadharCardUrl) return findAadharCardProblem(data.aadharCardUrl)
  return null
}

/**
 * Reserves a room for a resident: a free room with that number, else a new one. Rooms are keyed
 * by (property, number) in practice, so an occupied number is a conflict rather than a duplicate.
 * Without a number, the lowest-numbered free room is taken, matching the original add flow.
 */
async function claimRoom(transaction: Prisma.TransactionClient, propertyId: string, roomNumber?: string) {
  const freeRoom = await transaction.room.findFirst({ where: { propertyId, resident: { is: null }, ...(roomNumber ? { number: roomNumber } : {}) }, orderBy: { number: 'asc' } })
  if (freeRoom) return transaction.room.update({ where: { id: freeRoom.id }, data: { occupied: true } })
  if (roomNumber && await transaction.room.count({ where: { propertyId, number: roomNumber } })) throw new RoomOccupiedError(`Room ${roomNumber} is already occupied.`)
  return transaction.room.create({ data: { propertyId, number: roomNumber || `Room-${Date.now()}`, occupied: true } })
}

/**
 * Owner-supplied photo change: undefined leaves it alone, null removes it, a data URL replaces it.
 * Returns the Prisma fields to write, or an error message for a bad upload.
 */
function parseProfilePhoto(value: ResidentBody['profilePhoto']): { data: { profilePhotoUrl?: string | null; profilePhotoUpdatedAt?: Date | null } } | { error: string } {
  if (value === undefined) return { data: {} }
  if (value === null) return { data: { profilePhotoUrl: null, profilePhotoUpdatedAt: null } }
  const problem = findProfilePhotoProblem(value)
  return problem ? { error: problem } : { data: { profilePhotoUrl: value, profilePhotoUpdatedAt: new Date() } }
}

function respondToWriteError(response: Response, error: unknown, fallback: string) {
  if (error instanceof RoomOccupiedError) { response.status(409).json({ error: error.message }); return }
  if (error instanceof RentInputError) { response.status(400).json({ error: error.message }); return }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { response.status(400).json({ error: 'Property was not found.' }); return }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Resident was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Resident management routes; must be mounted behind the super admin guard. */
export const residentRouter = Router()

residentRouter.get('/residents', async (_request, response) => {
  if (!process.env.DATABASE_URL) { response.json([]); return }
  try {
    const [residents, withCards] = await withDatabaseRetry(() => Promise.all([
      prisma.resident.findMany({ ...residentSummaryQuery, orderBy: { createdAt: 'desc' } }),
      prisma.resident.findMany({ where: hasAadharCardWhere, select: { id: true } }),
    ]))
    const cardIds = new Set(withCards.map(({ id }) => id))
    response.json(residents.map((resident) => toResidentSummary(resident, cardIds.has(resident.id))))
  } catch (error) {
    console.error('Resident query failed:', error)
    response.status(503).json({ error: 'Residents could not be loaded.' })
  }
})

residentRouter.get('/residents/access-key', (_request, response) => {
  response.json({ accessKey: createAccessKey() })
})

residentRouter.get('/residents/:id/aadhar-card', async (request, response) => {
  try {
    const resident = await prisma.resident.findUnique({ where: { id: request.params.id }, select: { aadharCardUrl: true } })
    const match = resident?.aadharCardUrl?.match(aadharCardDataUrlPattern)
    if (!match) { response.status(404).json({ error: 'No Aadhaar card on file.' }); return }
    // Identity documents must not be cached by the browser or content-sniffed into something executable.
    response.set({ 'Content-Type': match[1], 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(match[2], 'base64'))
  } catch (error) {
    console.error('Aadhaar card lookup failed:', error)
    response.status(503).json({ error: 'Aadhaar card could not be loaded.' })
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
  const invalidField = findInvalidField(data)
  if (invalidField) { response.status(400).json({ error: invalidField }); return }
  const photo = parseProfilePhoto(body.profilePhoto)
  if ('error' in photo) { response.status(400).json({ error: photo.error }); return }
  const rent = parseMonthlyRent(body.monthlyRent, null)
  if (rent && 'error' in rent) { response.status(400).json({ error: rent.error }); return }
  if (body.accessKey && !isValidAccessKey(body.accessKey)) { response.status(400).json({ error: 'Access key is not in the generated format.' }); return }
  const joinedAt = parseDateOnly(body.joinedAt)
  if (joinedAt === null) { response.status(400).json({ error: 'Joining date must be a valid date.' }); return }
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Resident creation requires a database connection.' }); return }
  const { name } = data
  const { propertyId } = body
  try {
    const accessKey = body.accessKey || createAccessKey()
    const residentId = await prisma.$transaction(async (transaction) => {
      const room = await claimRoom(transaction, propertyId, body.roomNumber?.trim())
      const readyForReview = hasCompleteAadhar(data.aadharNumber, Boolean(data.aadharCardUrl))
      const resident = await transaction.resident.create({ data: { ...data, ...photo.data, ...(rent ? rent.data : {}), name, ...(joinedAt ? { joinedAt } : {}), ...(readyForReview ? { aadharStatus: AadharVerificationStatus.PENDING, aadharSubmittedAt: new Date() } : {}), accessKeyHash: hashAccessKey(accessKey), roomId: room.id } })
      return resident.id
    })
    response.status(201).json({ ...await findResidentSummary(residentId), accessKey })
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
  const photo = parseProfilePhoto(body.profilePhoto)
  if ('error' in photo) { response.status(400).json({ error: photo.error }); return }
  if (body.active !== undefined && typeof body.active !== 'boolean') { response.status(400).json({ error: 'Status must be true or false.' }); return }
  const joinedAt = parseDateOnly(body.joinedAt)
  if (joinedAt === null) { response.status(400).json({ error: 'Joining date must be a valid date.' }); return }
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Resident updates require a database connection.' }); return }
  try {
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.resident.findUniqueOrThrow({ where: { id }, select: { roomId: true, aadharStatus: true, aadharNumber: true, rentTrackedFrom: true, room: { select: { propertyId: true, number: true } } } })
      const rent = parseMonthlyRent(body.monthlyRent, current.rentTrackedFrom)
      if (rent && 'error' in rent) throw new RentInputError(rent.error)
      const targetPropertyId = body.propertyId || current.room.propertyId
      const targetRoomNumber = body.roomNumber?.trim() || current.room.number
      const isMoving = targetPropertyId !== current.room.propertyId || targetRoomNumber !== current.room.number
      const roomId = isMoving ? (await claimRoom(transaction, targetPropertyId, targetRoomNumber)).id : current.roomId
      // Completing the details on an unsubmitted resident queues them for review; it never verifies.
      const hasCard = Boolean(data.aadharCardUrl) || await transaction.resident.count({ where: { id, ...hasAadharCardWhere } }) > 0
      const becomesReviewable = current.aadharStatus === AadharVerificationStatus.NOT_SUBMITTED && hasCompleteAadhar(data.aadharNumber ?? current.aadharNumber, hasCard)
      await transaction.resident.update({ where: { id }, data: { ...data, ...photo.data, ...(rent ? rent.data : {}), ...(body.active !== undefined ? { active: body.active } : {}), ...(joinedAt ? { joinedAt } : {}), ...(becomesReviewable ? { aadharStatus: AadharVerificationStatus.PENDING, aadharSubmittedAt: new Date() } : {}), roomId } })
      if (isMoving) await transaction.room.update({ where: { id: current.roomId }, data: { occupied: false } })
      // A deactivated resident must lose app access immediately, not when their session expires.
      if (body.active === false) await transaction.session.deleteMany({ where: { residentId: id } })
    })
    response.json(await findResidentSummary(id))
  } catch (error) {
    respondToWriteError(response, error, 'Resident could not be updated.')
  }
})

// The key is only stored hashed, so "editing" it means issuing a new one. This is also the
// forgotten-password path: the resident's password is cleared so the new key works for sign-in.
residentRouter.post('/residents/:id/access-key', async (request, response) => {
  const { id } = request.params
  const accessKey = createAccessKey()
  try {
    await prisma.$transaction([
      prisma.resident.update({ where: { id }, data: { accessKeyHash: hashAccessKey(accessKey), passwordHash: null } }),
      prisma.session.deleteMany({ where: { residentId: id } }),
    ])
    response.json({ accessKey })
  } catch (error) {
    respondToWriteError(response, error, 'Access key could not be reset.')
  }
})

// Lets the owner choose a resident's password so they can tell the resident what it is; the
// password itself is stored only as a hash. Retires the access key and signs the resident out.
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

// The owner's decision on a resident's Aadhaar details. Approval needs both the number and the
// card on file, because that is what the owner is attesting to having checked.
residentRouter.post('/residents/:id/aadhar-verification', async (request, response) => {
  const { id } = request.params
  const { decision, reason } = request.body as { decision?: string; reason?: string }
  if (decision !== 'approve' && decision !== 'reject') { response.status(400).json({ error: 'Decision must be approve or reject.' }); return }
  const trimmedReason = reason?.trim() ?? ''
  if (decision === 'reject' && !trimmedReason) { response.status(400).json({ error: 'Tell the resident why their Aadhaar details were rejected.' }); return }
  if (trimmedReason.length > maxRejectionReasonLength) { response.status(400).json({ error: `Keep the reason under ${maxRejectionReasonLength} characters.` }); return }
  try {
    const [resident, cardCount] = await Promise.all([
      prisma.resident.findUniqueOrThrow({ where: { id }, select: { aadharNumber: true } }),
      prisma.resident.count({ where: { id, ...hasAadharCardWhere } }),
    ])
    if (decision === 'approve' && !hasCompleteAadhar(resident.aadharNumber, cardCount > 0)) { response.status(409).json({ error: 'Both the Aadhaar number and the card must be on file before approving.' }); return }
    await prisma.resident.update({ where: { id }, data: decision === 'approve'
      ? { aadharStatus: AadharVerificationStatus.VERIFIED, aadharRejectionReason: null, aadharReviewedAt: new Date() }
      : { aadharStatus: AadharVerificationStatus.REJECTED, aadharRejectionReason: trimmedReason, aadharReviewedAt: new Date() } })
    response.json(await findResidentSummary(id))
  } catch (error) {
    respondToWriteError(response, error, 'Verification could not be saved.')
  }
})

residentRouter.delete('/residents/:id', async (request, response) => {
  if (!process.env.DATABASE_URL) { response.status(501).json({ error: 'Resident deletion requires a database connection.' }); return }
  try {
    const resident = await prisma.resident.delete({ where: { id: request.params.id } })
    await prisma.room.update({ where: { id: resident.roomId }, data: { occupied: false } })
    response.status(204).send()
  } catch (error) {
    console.error('Resident deletion failed:', error)
    response.status(404).json({ error: 'Resident could not be deleted.' })
  }
})
