import type { Prisma } from '@prisma/client'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { prisma } from './db.js'

/**
 * The owner's Door locks to-do list: PIN changes to make by hand on each lock, queued by doorAccess.ts in the
 * same transaction as the change behind them, so the list can never miss one or show one for a failed change.
 */

const taskSelect = { id: true, action: true, pin: true, lockId: true, lockName: true, holderKind: true, holderName: true, resident: { select: { name: true } }, worker: { select: { name: true } }, propertyName: true, reason: true, createdAt: true, doneAt: true, doneByName: true } as const
type TaskRow = Prisma.DoorLockTaskGetPayload<{ select: typeof taskSelect }>

// The holder's name as it is now while they are still on record (a renamed resident reads as they are known),
// else the name copied in when the task was made.
const toTaskView = ({ resident, worker, ...task }: TaskRow) => ({ ...task, holderName: resident?.name ?? worker?.name ?? task.holderName })
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
    response.json({ pending: pending.map(toTaskView), done: done.map(toTaskView) })
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
    response.json(toTaskView(await prisma.doorLockTask.findUniqueOrThrow({ where: { id: request.params.id }, select: taskSelect })))
  } catch (error) {
    console.error('Door lock task could not be updated:', error)
    response.status(503).json({ error: 'Door lock task could not be updated.' })
  }
})
