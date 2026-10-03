import { Router, type RequestHandler } from 'express'
import { prisma } from './db.js'
import { notifyInBackground, notifyMaintenanceRaised, notifyMaintenanceUpdated } from './notifications.js'
import { findMaintenancePhotoProblem, sendMaintenancePhoto } from './photo.js'

/** Kinds of complaint a resident can pick; the web app shows matching labels. */
export const maintenanceCategories = ['plumbing', 'electrical', 'wifi', 'furniture', 'cleaning', 'appliance', 'other'] as const
const statuses = ['open', 'in_progress', 'resolved'] as const
type Status = (typeof statuses)[number]

const maxTitleLength = 80
const maxDetailsLength = 1000
const maxNoteLength = 500

// What both sides see; the photo itself is served separately so lists stay small.
const viewSelect = { id: true, title: true, category: true, details: true, status: true, ownerNote: true, createdAt: true, updatedAt: true, resolvedAt: true, photoUrl: true } as const
type Row = { id: string; title: string; category: string; details: string; status: string; ownerNote: string | null; createdAt: Date; updatedAt: Date; resolvedAt: Date | null; photoUrl: string | null }
const toView = ({ photoUrl, ...row }: Row) => ({ ...row, hasPhoto: Boolean(photoUrl) })

/** Resident routes: report a problem in their room or building, and follow it. Mounted with the portal. */
export function residentMaintenanceRoutes(router: Router, guards: RequestHandler[], residentOf: (locals: Record<string, unknown>) => string) {
  router.get('/resident-portal/maintenance', ...guards, async (_request, response) => {
    const rows = await prisma.maintenanceRequest.findMany({ where: { residentId: residentOf(response.locals) }, orderBy: { createdAt: 'desc' }, take: 30, select: viewSelect })
    response.json(rows.map(toView))
  })

  router.post('/resident-portal/maintenance', ...guards, async (request, response) => {
    const residentId = residentOf(response.locals)
    const { title, category, details, photo } = request.body as { title?: unknown; category?: unknown; details?: unknown; photo?: unknown }
    if (typeof title !== 'string' || !title.trim()) { response.status(400).json({ error: 'Say briefly what the problem is.' }); return }
    if (title.trim().length > maxTitleLength) { response.status(400).json({ error: `Keep the title under ${maxTitleLength} characters.` }); return }
    if (typeof category !== 'string' || !(maintenanceCategories as readonly string[]).includes(category)) { response.status(400).json({ error: 'Choose what kind of problem it is.' }); return }
    if (details !== undefined && (typeof details !== 'string' || details.length > maxDetailsLength)) { response.status(400).json({ error: `Keep the details under ${maxDetailsLength} characters.` }); return }
    const photoProblem = photo ? findMaintenancePhotoProblem(photo) : null
    if (photoProblem) { response.status(400).json({ error: photoProblem }); return }
    try {
      const resident = await prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { room: { select: { propertyId: true } } } })
      if (!resident.room) { response.status(409).json({ error: 'You have moved out of the property.' }); return }
      const created = await prisma.maintenanceRequest.create({ data: { title: title.trim(), category, details: (details as string | undefined)?.trim() ?? '', photoUrl: (photo as string | undefined) || null, propertyId: resident.room.propertyId, residentId }, select: viewSelect })
      notifyInBackground(() => notifyMaintenanceRaised(created.id))
      response.status(201).json(toView(created))
    } catch (error) {
      console.error('Maintenance request failed:', error)
      response.status(503).json({ error: 'Your request could not be sent.' })
    }
  })

  router.get('/resident-portal/maintenance/:id/photo', ...guards, async (request, response) => {
    const row = await prisma.maintenanceRequest.findFirst({ where: { id: String(request.params.id), residentId: residentOf(response.locals) }, select: { photoUrl: true } })
    sendMaintenancePhoto(response, row?.photoUrl)
  })
}

/** Owner routes for the Maintenance page; mounted behind the super admin guard. */
export const maintenanceAdminRouter = Router()

maintenanceAdminRouter.get('/maintenance', async (_request, response) => {
  const rows = await prisma.maintenanceRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { ...viewSelect, property: { select: { name: true } }, resident: { select: { id: true, name: true, room: { select: { number: true } } } } } })
  response.json(rows.map(({ property, resident, ...row }) => ({ ...toView(row), property: property.name, resident: resident ? { id: resident.id, name: resident.name, room: resident.room?.number ?? null } : null })))
})

// Move a request along (open → in progress → resolved) and/or reply; the resident is emailed.
maintenanceAdminRouter.patch('/maintenance/:id', async (request, response) => {
  const { status, ownerNote } = request.body as { status?: unknown; ownerNote?: unknown }
  if (status !== undefined && !(statuses as readonly unknown[]).includes(status)) { response.status(400).json({ error: 'Status must be open, in progress or resolved.' }); return }
  if (ownerNote !== undefined && (typeof ownerNote !== 'string' || ownerNote.length > maxNoteLength)) { response.status(400).json({ error: `Keep the reply under ${maxNoteLength} characters.` }); return }
  const data = { ...(status ? { status: status as Status, resolvedAt: status === 'resolved' ? new Date() : null } : {}), ...(ownerNote !== undefined ? { ownerNote: (ownerNote as string).trim() || null } : {}) }
  const updated = await prisma.maintenanceRequest.updateMany({ where: { id: request.params.id }, data })
  if (!updated.count) { response.status(404).json({ error: 'That request was not found.' }); return }
  notifyInBackground(() => notifyMaintenanceUpdated(request.params.id))
  response.status(204).send()
})

maintenanceAdminRouter.get('/maintenance/:id/photo', async (request, response) => {
  const row = await prisma.maintenanceRequest.findUnique({ where: { id: request.params.id }, select: { photoUrl: true } })
  sendMaintenancePhoto(response, row?.photoUrl)
})
