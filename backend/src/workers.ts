import { Prisma, WorkerRole } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from './db.js'
import { createUniqueDoorPin, syncDoorAccess } from './doorAccess.js'
import { getSettings } from './settings.js'
import { parseDateOnly } from './dates.js'
import { findProfilePhotoProblem, photoVersion, sendWorkerPhoto } from './photo.js'
import { normalizePhone, phoneRequirement } from './validation.js'

const maxWorkersPerProperty = 100
const maxNameLength = 40

// Includes the door PIN, so only for the dashboard: the resident portal selects names only.
const rowSelect = { id: true, name: true, role: true, phone: true, joinedOn: true, doorAccessKey: true, photoUpdatedAt: true } as const
type WorkerRow = Prisma.WorkerGetPayload<{ select: typeof rowSelect }>

/** What clients see of a worker: the photo as a version for its URL, never the image itself. */
export const toWorkerView = ({ photoUpdatedAt, ...worker }: WorkerRow) => ({ ...worker, photoVersion: photoVersion(photoUpdatedAt) })

/** The query for a property's workers as the dashboard sends them: by role, then in the order added. */
export const workersQuery = { select: rowSelect, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] } satisfies Prisma.Property$workersArgs

const isRole = (value: unknown): value is WorkerRole => typeof value === 'string' && (Object.values(WorkerRole) as string[]).includes(value)

type WorkerBody = { name?: unknown; role?: unknown; phone?: unknown; joinedOn?: unknown; photo?: unknown }
type WorkerData = { name: string; role: WorkerRole; phone: string; joinedOn: Date; photoUrl?: string | null; photoUpdatedAt?: Date | null }

/**
 * A worker from the request body, or the message to show. Name, role, phone and date of joining
 * (YYYY-MM-DD; a future date is allowed for someone about to start) are required on
 * both add and edit; `photo` is a data URL to set, null to remove, or absent to keep the current one.
 */
function parseWorker(body: WorkerBody): WorkerData | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Enter the person\'s name.' }
  if (name.length > maxNameLength) return { error: `Keep the name under ${maxNameLength} characters.` }
  if (!isRole(body.role)) return { error: 'Choose what they do.' }
  const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null
  if (!phone) return { error: phoneRequirement }
  const joinedOn = typeof body.joinedOn === 'string' ? parseDateOnly(body.joinedOn) : null
  if (!joinedOn) return { error: 'Enter a valid date of joining.' }
  const fields = { name, role: body.role, phone, joinedOn }
  if (body.photo === undefined) return fields
  if (body.photo === null) return { ...fields, photoUrl: null, photoUpdatedAt: null }
  const problem = findProfilePhotoProblem(body.photo)
  return problem ? { error: problem } : { ...fields, photoUrl: body.photo as string, photoUpdatedAt: new Date() }
}

/** Whether another worker at the property already has this name in this role (case-insensitive). */
async function isDuplicate(propertyId: string, { name, role }: WorkerData, exceptId?: string) {
  const match = await prisma.worker.findFirst({ where: { propertyId, role, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })
  return Boolean(match)
}

function respondToError(response: Response, error: unknown, fallback: string) {
  // P2003: the property was deleted meanwhile (foreign key); P2025: the worker no longer exists.
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2003' || error.code === 'P2025')) { response.status(404).json({ error: 'That was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/**
 * The people who work at each property: head cook, helping cook, housekeeping, security, electrician
 * and plumber. Adding, editing and removing them is for super admins only, which staffGuard enforces;
 * receptionists see them (and their photos) read-only. Mounted behind the staff sign-in check.
 */
export const workersAdminRouter = Router()

// Adds one worker to the property and answers with the saved worker.
workersAdminRouter.post('/properties/:id/workers', async (request, response) => {
  const parsed = parseWorker(request.body as WorkerBody)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  const propertyId = request.params.id
  try {
    if (await prisma.worker.count({ where: { propertyId } }) >= maxWorkersPerProperty) { response.status(409).json({ error: `A property can have up to ${maxWorkersPerProperty} staff.` }); return }
    if (await isDuplicate(propertyId, parsed)) { response.status(409).json({ error: `${parsed.name} is already listed in that role.` }); return }
    response.status(201).json(toWorkerView(await prisma.worker.create({ data: { ...parsed, propertyId }, select: rowSelect })))
  } catch (error) {
    respondToError(response, error, 'Staff member could not be added.')
  }
})

// Replaces a worker's name, role, phone and date of joining, and their photo when one is sent.
workersAdminRouter.put('/properties/:id/workers/:workerId', async (request, response) => {
  const parsed = parseWorker(request.body as WorkerBody)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  const { id: propertyId, workerId } = request.params
  try {
    if (await isDuplicate(propertyId, parsed, workerId)) { response.status(409).json({ error: `${parsed.name} is already listed in that role.` }); return }
    // Scoped by property too, so a worker cannot be edited through another property's URL.
    response.json(toWorkerView(await prisma.worker.update({ where: { id: workerId, propertyId }, data: parsed, select: rowSelect })))
  } catch (error) {
    respondToError(response, error, 'Staff member could not be saved.')
  }
})

// Removes one worker from the property, queuing their door PIN's removal from the locks first.
workersAdminRouter.delete('/properties/:id/workers/:workerId', async (request, response) => {
  const { id: propertyId, workerId } = request.params
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.worker.update({ where: { id: workerId, propertyId }, data: { doorAccessKey: null } })
      await syncDoorAccess(transaction, { workerId }, 'Staff member removed')
      await transaction.worker.delete({ where: { id: workerId } })
    })
    response.status(204).end()
  } catch (error) {
    respondToError(response, error, 'Staff member could not be removed.')
  }
})

// Door lock PIN for the property's locks marked for staff: POST issues a new one (replacing any old one), DELETE
// removes it. Super admins only (see staffGuard). Each change queues the PIN changes to make on those locks.
workersAdminRouter.post('/properties/:id/workers/:workerId/door-key', async (request, response) => {
  const { id: propertyId, workerId } = request.params
  try {
    const settings = await getSettings()
    if (!settings.doorKeysEnabled) { response.status(409).json({ error: 'Door access keys are switched off in Settings → Smart lock.' }); return }
    // Unlike residents, staff have no unnamed fallback lock: a PIN with no lock to go on would open nothing.
    if (!await prisma.doorLock.count({ where: { propertyId, removedAt: null, forStaff: true, unlockMethods: { has: 'PIN' } } })) { response.status(409).json({ error: 'This property has no PIN door lock for staff. Add one under Door locks first.' }); return }
    const doorAccessKey = await prisma.$transaction(async (transaction) => {
      const pin = await createUniqueDoorPin(transaction, settings.doorPinLength)
      await transaction.worker.update({ where: { id: workerId, propertyId }, data: { doorAccessKey: pin } })
      await syncDoorAccess(transaction, { workerId }, 'New door access key')
      return pin
    })
    response.json({ doorAccessKey })
  } catch (error) {
    respondToError(response, error, 'Door access key could not be saved.')
  }
})

workersAdminRouter.delete('/properties/:id/workers/:workerId/door-key', async (request, response) => {
  const { id: propertyId, workerId } = request.params
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.worker.update({ where: { id: workerId, propertyId }, data: { doorAccessKey: null } })
      await syncDoorAccess(transaction, { workerId }, 'Key removed by a super admin')
    })
    response.status(204).end()
  } catch (error) {
    respondToError(response, error, 'Door access key could not be removed.')
  }
})

// The worker's photo; its URL carries ?v=<photoVersion>, so it is cached until the photo changes.
workersAdminRouter.get('/properties/:id/workers/:workerId/photo', async (request, response) => {
  try {
    const worker = await prisma.worker.findUnique({ where: { id: request.params.workerId, propertyId: request.params.id }, select: { photoUrl: true } })
    sendWorkerPhoto(response, worker?.photoUrl)
  } catch (error) {
    respondToError(response, error, 'Photo could not be loaded.')
  }
})
