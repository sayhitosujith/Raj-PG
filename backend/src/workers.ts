import { Prisma, WorkerRole } from '@prisma/client'
import { Router } from 'express'
import { prisma } from './db.js'
import { normalizePhone, phoneRequirement } from './validation.js'

const maxWorkersPerProperty = 100
const maxNameLength = 40

/** The fields of a worker every client sees; the dashboard sends them with each property. */
export const workerSelect = { id: true, name: true, role: true, phone: true } as const

/** A property's workers in a stable order: by role, then in the order they were added. */
export const workerOrder = [{ role: 'asc' }, { createdAt: 'asc' }] satisfies Prisma.WorkerOrderByWithRelationInput[]

const isRole = (value: unknown): value is WorkerRole => typeof value === 'string' && (Object.values(WorkerRole) as string[]).includes(value)

type WorkerInput = { name: string; role: WorkerRole; phone: string | null }

/** A worker from the request body, or the message to show when it is not acceptable. */
function parseWorker(body: { name?: unknown; role?: unknown; phone?: unknown }): WorkerInput | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Enter the person\'s name.' }
  if (name.length > maxNameLength) return { error: `Keep the name under ${maxNameLength} characters.` }
  if (!isRole(body.role)) return { error: 'Choose what they do.' }
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const phone = rawPhone ? normalizePhone(rawPhone) : null
  if (rawPhone && !phone) return { error: phoneRequirement }
  return { name, role: body.role, phone }
}

/**
 * The people who work at each property (cook, security, housekeeping, electrician, plumber). Adding and
 * removing them is for super admins only, which staffGuard enforces; receptionists read them through the
 * dashboard. Mounted behind the staff sign-in check.
 */
export const workersAdminRouter = Router()

// Adds one worker to the property and answers with the saved worker.
workersAdminRouter.post('/properties/:id/workers', async (request, response) => {
  const parsed = parseWorker(request.body as { name?: unknown; role?: unknown; phone?: unknown })
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  const propertyId = request.params.id
  try {
    const existing = await prisma.worker.findMany({ where: { propertyId }, select: { name: true, role: true } })
    if (existing.length >= maxWorkersPerProperty) { response.status(409).json({ error: `A property can have up to ${maxWorkersPerProperty} staff.` }); return }
    if (existing.some((worker) => worker.role === parsed.role && worker.name.toLowerCase() === parsed.name.toLowerCase())) { response.status(409).json({ error: `${parsed.name} is already listed in that role.` }); return }
    response.status(201).json(await prisma.worker.create({ data: { ...parsed, propertyId }, select: workerSelect }))
  } catch (error) {
    // The property's id is the foreign key, so a property deleted meanwhile fails the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { response.status(404).json({ error: 'Property was not found.' }); return }
    console.error('Worker could not be added:', error)
    response.status(503).json({ error: 'Staff member could not be added.' })
  }
})

// Removes one worker from the property.
workersAdminRouter.delete('/properties/:id/workers/:workerId', async (request, response) => {
  try {
    const { count } = await prisma.worker.deleteMany({ where: { id: request.params.workerId, propertyId: request.params.id } })
    if (!count) { response.status(404).json({ error: 'Staff member was not found.' }); return }
    response.status(204).end()
  } catch (error) {
    console.error('Worker could not be removed:', error)
    response.status(503).json({ error: 'Staff member could not be removed.' })
  }
})
