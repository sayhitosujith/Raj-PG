import { DoorLockAction, type Prisma } from '@prisma/client'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { prisma } from './db.js'

/**
 * The lock (Qubo) has no API the app can reach, so PINs are added to and deleted from it by hand.
 * Every change to a resident's door access key queues a task here, inside the same transaction as the
 * change, so the owner's Door locks list can never miss one or show one for a change that failed.
 */

type Db = Prisma.TransactionClient
type KeyHolder = { residentId: string; residentName: string; pin: string; property: { id: string; name: string } | null | undefined }

const holderSelect = { name: true, doorAccessKey: true, room: { select: { property: { select: { id: true, name: true } } } } } as const

const taskData = (action: DoorLockAction, { residentId, residentName, pin, property }: KeyHolder, reason: string) =>
  ({ action, pin, residentId, residentName, propertyId: property?.id ?? null, propertyName: property?.name ?? null, reason })

/**
 * Queues deleting a PIN from the lock. If the PIN's own "add" task is still pending, it never reached
 * the lock, so that task is cancelled instead of asking the owner to delete a PIN that is not there.
 */
export async function queuePinRemoval(db: Db, holder: KeyHolder, reason: string) {
  const { count } = await db.doorLockTask.deleteMany({ where: { residentId: holder.residentId, action: DoorLockAction.ADD, pin: holder.pin, doneAt: null } })
  if (!count) await db.doorLockTask.create({ data: taskData(DoorLockAction.DELETE, holder, reason) })
}

async function currentHolder(db: Db, residentId: string) {
  const resident = await db.resident.findUnique({ where: { id: residentId }, select: holderSelect })
  return resident ? { residentId, residentName: resident.name, pin: resident.doorAccessKey, property: resident.room?.property } : null
}

/** Queues deleting the resident's current PIN, if they have one. Call before the key is cleared. */
export async function queueCurrentKeyRemoval(db: Db, residentId: string, reason: string) {
  const holder = await currentHolder(db, residentId)
  if (holder?.pin) await queuePinRemoval(db, { ...holder, pin: holder.pin }, reason)
}

/** Queues adding a newly issued PIN, and deleting the one it replaces. Call before the key is saved. */
export async function queueKeyIssued(db: Db, residentId: string, newPin: string) {
  const holder = await currentHolder(db, residentId)
  if (!holder) return
  if (holder.pin) await queuePinRemoval(db, { ...holder, pin: holder.pin }, 'Replaced by a new PIN')
  await db.doorLockTask.create({ data: taskData(DoorLockAction.ADD, { ...holder, pin: newPin }, 'New door access key') })
}

const taskSelect = { id: true, action: true, pin: true, residentName: true, propertyName: true, reason: true, createdAt: true, doneAt: true, doneByName: true } as const
const recentDoneLimit = 30

/** Owner routes for the Door locks page; owner-only through staffGuard. Mounted behind the staff sign-in check. */
export const doorLockTasksRouter = Router()

// Pending lock changes, oldest first (the order they must be made in), and the most recent done ones.
doorLockTasksRouter.get('/door-lock-tasks', async (_request, response) => {
  try {
    const [pending, done] = await Promise.all([
      prisma.doorLockTask.findMany({ where: { doneAt: null }, orderBy: { createdAt: 'asc' }, select: taskSelect }),
      prisma.doorLockTask.findMany({ where: { doneAt: { not: null } }, orderBy: { doneAt: 'desc' }, take: recentDoneLimit, select: taskSelect }),
    ])
    response.json({ pending, done })
  } catch (error) {
    console.error('Door lock tasks could not be loaded:', error)
    response.status(503).json({ error: 'Door lock tasks could not be loaded.' })
  }
})

// Confirms the change was made on the lock.
doorLockTasksRouter.post('/door-lock-tasks/:id/done', async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const staff = await prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } })
    // Conditional, so a second click (or a second admin) does not overwrite who did it and when.
    const { count } = await prisma.doorLockTask.updateMany({ where: { id: request.params.id, doneAt: null }, data: { doneAt: new Date(), doneByName: staff?.name ?? null } })
    if (!count) { response.status(409).json({ error: 'That task is already done or no longer exists.' }); return }
    response.json(await prisma.doorLockTask.findUniqueOrThrow({ where: { id: request.params.id }, select: taskSelect }))
  } catch (error) {
    console.error('Door lock task could not be updated:', error)
    response.status(503).json({ error: 'Door lock task could not be updated.' })
  }
})
