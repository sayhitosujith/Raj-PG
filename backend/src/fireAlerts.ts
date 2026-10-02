import { Router } from 'express'
import { prisma } from './db.js'
import { notifyFireAlert, notifyInBackground } from './notifications.js'

/** An active fire alarm as both portals show it. */
const alertSelect = { id: true, propertyId: true, raisedByName: true, createdAt: true, property: { select: { name: true } } } as const

/** The active alarm for a property, or null. */
export function activeFireAlert(propertyId: string) {
  return prisma.fireAlert.findFirst({ where: { propertyId, clearedAt: null }, orderBy: { createdAt: 'desc' }, select: alertSelect })
}

/**
 * Raises the alarm for a property, or returns the one already active there (two residents pressing
 * at once must not send everyone two sets of messages). Messages go out in the background, so the
 * person raising it sees the alarm straight away.
 */
export async function raiseFireAlert(propertyId: string, raisedBy: { name: string; residentId?: string }) {
  const existing = await activeFireAlert(propertyId)
  if (existing) return existing
  const alert = await prisma.fireAlert.create({ data: { propertyId, raisedByName: raisedBy.name, raisedByResidentId: raisedBy.residentId ?? null }, select: { ...alertSelect, raisedByResidentId: true } })
  notifyInBackground(() => notifyFireAlert(alert))
  const { raisedByResidentId: _, ...shown } = alert
  return shown
}

/** Owner routes: see every active alarm, raise one for a property, clear one once it is safe. */
export const fireAlertAdminRouter = Router()

fireAlertAdminRouter.get('/fire-alerts', async (_request, response) => {
  response.json({ alerts: await prisma.fireAlert.findMany({ where: { clearedAt: null }, orderBy: { createdAt: 'desc' }, select: alertSelect }) })
})

fireAlertAdminRouter.post('/fire-alerts', async (request, response) => {
  const { propertyId } = request.body as { propertyId?: unknown }
  if (typeof propertyId !== 'string' || !propertyId) { response.status(400).json({ error: 'Choose the property with the fire.' }); return }
  try {
    if (!await prisma.property.count({ where: { id: propertyId } })) { response.status(404).json({ error: 'That property was not found.' }); return }
    response.status(201).json({ alert: await raiseFireAlert(propertyId, { name: 'Property owner' }) })
  } catch (error) {
    console.error('Raising the fire alarm failed:', error)
    response.status(503).json({ error: 'The fire alarm could not be raised. Call 101 or 112 directly.' })
  }
})

fireAlertAdminRouter.post('/fire-alerts/:id/clear', async (request, response) => {
  const cleared = await prisma.fireAlert.updateMany({ where: { id: request.params.id, clearedAt: null }, data: { clearedAt: new Date() } })
  if (!cleared.count) { response.status(404).json({ error: 'That alarm is not active.' }); return }
  response.status(204).send()
})
