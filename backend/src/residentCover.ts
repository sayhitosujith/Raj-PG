import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { parseCoverPosition } from './coverPosition.js'
import { prisma, withDatabaseRetry } from './db.js'
import { findCoverPhotoProblem, sendCoverPhoto } from './photo.js'
import { requirePortalAccess, requireResident } from './residentPortal.js'

/**
 * The resident's own Profile cover image: view, replace, or remove it (the portal then shows the property's photo).
 * /resident-portal/me reports its version as coverVersion, which the image URL carries so caches refresh on change,
 * and its focal point and zoom as coverPosition.
 */
export const residentCoverRouter = Router()

residentCoverRouter.get('/resident-portal/cover', requireResident, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    const cover = await prisma.residentCoverPhoto.findUnique({ where: { residentId: userId }, select: { imageUrl: true } })
    sendCoverPhoto(response, cover?.imageUrl)
  } catch (error) {
    console.error('Cover image lookup failed:', error)
    response.status(503).json({ error: 'Your cover image could not be loaded.' })
  }
})

residentCoverRouter.put('/resident-portal/cover', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const { image } = request.body as { image?: unknown }
  const problem = findCoverPhotoProblem(image)
  if (problem) { response.status(400).json({ error: problem }); return }
  try {
    // A new image starts centred and unzoomed: the old focal point was chosen for a different picture.
    await withDatabaseRetry(() => prisma.residentCoverPhoto.upsert({ where: { residentId: userId }, create: { residentId: userId, imageUrl: image as string }, update: { imageUrl: image as string, positionX: 50, positionY: 50, zoom: 1 } }))
    response.status(204).send()
  } catch (error) {
    console.error('Cover image upload failed:', error)
    response.status(503).json({ error: 'Your cover image could not be saved.' })
  }
})

residentCoverRouter.patch('/resident-portal/cover/position', requireResident, requirePortalAccess, async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const parsed = parseCoverPosition(request.body)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  const { x, y, zoom } = parsed.position
  try {
    const { count } = await withDatabaseRetry(() => prisma.residentCoverPhoto.updateMany({ where: { residentId: userId }, data: { positionX: x, positionY: y, zoom } }))
    if (count === 0) { response.status(404).json({ error: 'Add a cover image before adjusting it.' }); return }
    response.status(204).send()
  } catch (error) {
    console.error('Cover position update failed:', error)
    response.status(503).json({ error: 'Your cover position could not be saved.' })
  }
})

residentCoverRouter.delete('/resident-portal/cover', requireResident, requirePortalAccess, async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  try {
    await prisma.residentCoverPhoto.deleteMany({ where: { residentId: userId } })
    response.status(204).send()
  } catch (error) {
    console.error('Cover image removal failed:', error)
    response.status(503).json({ error: 'Your cover image could not be removed.' })
  }
})
