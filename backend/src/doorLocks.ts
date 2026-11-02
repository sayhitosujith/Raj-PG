import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from './db.js'
import { syncPropertyDoorAccess } from './doorAccess.js'

/**
 * Each property's door locks and who gets a PIN on them (residents, staff or both), set up on the Door
 * locks page. Every change re-syncs the property's PIN holders, so the locks' to-do list gains exactly the
 * PINs to add or delete. Owner-only through staffGuard; mounted behind the staff sign-in check.
 */

const maxLocksPerProperty = 10
const maxNameLength = 40

const lockSelect = { id: true, propertyId: true, name: true, forResidents: true, forStaff: true } as const

type LockBody = { propertyId?: unknown; name?: unknown; forResidents?: unknown; forStaff?: unknown }

function parseLock(body: LockBody): { name: string; forResidents: boolean; forStaff: boolean } | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Name the lock, e.g. Main door.' }
  if (name.length > maxNameLength) return { error: `Keep the name under ${maxNameLength} characters.` }
  if (typeof body.forResidents !== 'boolean' || typeof body.forStaff !== 'boolean') return { error: 'Say whether residents and staff use this lock.' }
  if (!body.forResidents && !body.forStaff) return { error: 'A lock must be for residents, staff or both.' }
  return { name, forResidents: body.forResidents, forStaff: body.forStaff }
}

async function isNameTaken(propertyId: string, name: string, exceptId?: string) {
  return Boolean(await prisma.doorLock.findFirst({ where: { propertyId, removedAt: null, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }))
}

function respondToError(response: Response, error: unknown, fallback: string) {
  // P2003: the property was deleted meanwhile; P2025: the lock no longer exists.
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2003' || error.code === 'P2025')) { response.status(404).json({ error: 'That was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

export const doorLocksRouter = Router()

// Every property's locks in use, in the order they were added.
doorLocksRouter.get('/door-locks', async (_request, response) => {
  try {
    response.json(await prisma.doorLock.findMany({ where: { removedAt: null }, orderBy: { createdAt: 'asc' }, select: lockSelect }))
  } catch (error) {
    respondToError(response, error, 'Door locks could not be loaded.')
  }
})

doorLocksRouter.post('/door-locks', async (request, response) => {
  const body = request.body as LockBody
  const parsed = parseLock(body)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId : ''
  if (!propertyId) { response.status(400).json({ error: 'Choose the property.' }); return }
  try {
    if (await isNameTaken(propertyId, parsed.name)) { response.status(409).json({ error: `This property already has a lock called ${parsed.name}.` }); return }
    const lock = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.doorLock.count({ where: { propertyId, removedAt: null } })
      if (existing >= maxLocksPerProperty) return null
      const created = await transaction.doorLock.create({ data: { propertyId, ...parsed }, select: lockSelect })
      // The first lock listed is taken to be the one used so far, so PINs already on it are not asked for again.
      if (!existing) await transaction.doorLockTask.updateMany({ where: { propertyId, lockId: null }, data: { lockId: created.id, lockName: created.name } })
      await syncPropertyDoorAccess(transaction, propertyId, `Lock added: ${created.name}`)
      return created
    })
    if (!lock) { response.status(409).json({ error: `A property can have up to ${maxLocksPerProperty} locks.` }); return }
    response.status(201).json(lock)
  } catch (error) {
    respondToError(response, error, 'The lock could not be added.')
  }
})

// Renames a lock or changes who uses it; the PINs to add or delete for that are queued at once.
doorLocksRouter.put('/door-locks/:id', async (request, response) => {
  const parsed = parseLock(request.body as LockBody)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  try {
    const current = await prisma.doorLock.findFirstOrThrow({ where: { id: request.params.id, removedAt: null }, select: { propertyId: true } })
    if (await isNameTaken(current.propertyId, parsed.name, request.params.id)) { response.status(409).json({ error: `This property already has a lock called ${parsed.name}.` }); return }
    const lock = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.doorLock.update({ where: { id: request.params.id }, data: parsed, select: lockSelect })
      // Pending tasks show the lock's name, so they follow a rename.
      await transaction.doorLockTask.updateMany({ where: { lockId: updated.id, doneAt: null }, data: { lockName: updated.name } })
      await syncPropertyDoorAccess(transaction, current.propertyId, `Lock changed: ${updated.name}`)
      return updated
    })
    response.json(lock)
  } catch (error) {
    respondToError(response, error, 'The lock could not be saved.')
  }
})

// A lock taken out of use: its unfinished tasks are dropped (there is nothing left to program) and it is
// no longer synced. Its history stays readable. Removing a property's last lock brings back its unnamed lock.
doorLocksRouter.delete('/door-locks/:id', async (request, response) => {
  try {
    await prisma.$transaction(async (transaction) => {
      const lock = await transaction.doorLock.update({ where: { id: request.params.id, removedAt: null }, data: { removedAt: new Date() }, select: { propertyId: true, name: true } })
      await transaction.doorLockTask.deleteMany({ where: { lockId: request.params.id, doneAt: null } })
      await syncPropertyDoorAccess(transaction, lock.propertyId, `Lock removed: ${lock.name}`)
    })
    response.status(204).end()
  } catch (error) {
    respondToError(response, error, 'The lock could not be removed.')
  }
})
