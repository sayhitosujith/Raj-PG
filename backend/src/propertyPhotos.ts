import { UserRole } from '@prisma/client'
import { Router, type Response } from 'express'
import { requireRole } from './auth.js'
import { prisma } from './db.js'
import { findPropertyPhotoProblem, sendPropertyPhoto } from './photo.js'
import { requirePortalAccess } from './residentPortal.js'
import { requireResidentFeature } from './residentFeatureGate.js'

/**
 * A property's photo gallery: the owner adds up to 12 photos (each with an optional caption) and the
 * property's residents see them on their Home tab. Lists carry ids and captions only; each image is
 * fetched from its own URL, which never changes for a photo, so browsers cache it for good.
 */
export const maxPropertyPhotos = 12
const maxCaptionLength = 80

/** The photos of a property for a client, oldest first, each with the URL its image is served from. */
async function photoList(propertyId: string, base: string) {
  const photos = await prisma.propertyPhoto.findMany({ where: { propertyId }, orderBy: { createdAt: 'asc' }, select: { id: true, caption: true } })
  return photos.map(({ id, caption }) => ({ id, caption, url: `${base}/${id}/image` }))
}

/** A trimmed caption, null when blank, or an error message. */
function readCaption(value: unknown): { caption: string | null } | { error: string } {
  if (value === undefined || value === null) return { caption: null }
  if (typeof value !== 'string') return { error: 'Caption must be text.' }
  const caption = value.trim()
  if (caption.length > maxCaptionLength) return { error: `Captions can be up to ${maxCaptionLength} characters.` }
  return { caption: caption || null }
}

async function sendPhoto(response: Response, where: { id: string; propertyId: string }) {
  const photo = await prisma.propertyPhoto.findFirst({ where, select: { imageUrl: true } })
  sendPropertyPhoto(response, photo?.imageUrl)
}

/** Owner routes; mounted behind the super admin guard. */
export const propertyPhotoAdminRouter = Router()
const adminBase = (propertyId: string) => `/api/properties/${propertyId}/photos`

propertyPhotoAdminRouter.get('/properties/:id/photos', async (request, response) => {
  try {
    response.json({ photos: await photoList(request.params.id, adminBase(request.params.id)), max: maxPropertyPhotos })
  } catch (error) {
    console.error('Property photos failed:', error)
    response.status(503).json({ error: 'The photos could not be loaded.' })
  }
})

propertyPhotoAdminRouter.post('/properties/:id/photos', async (request, response) => {
  const { id } = request.params
  const { image, caption: rawCaption } = request.body as { image?: unknown; caption?: unknown }
  const problem = findPropertyPhotoProblem(image)
  if (problem) { response.status(400).json({ error: problem }); return }
  const caption = readCaption(rawCaption)
  if ('error' in caption) { response.status(400).json({ error: caption.error }); return }
  try {
    const property = await prisma.property.findUnique({ where: { id }, select: { _count: { select: { photos: true } } } })
    if (!property) { response.status(404).json({ error: 'That property was not found.' }); return }
    if (property._count.photos >= maxPropertyPhotos) { response.status(409).json({ error: `A property can have up to ${maxPropertyPhotos} photos. Remove one to add another.` }); return }
    await prisma.propertyPhoto.create({ data: { propertyId: id, imageUrl: image as string, caption: caption.caption } })
    response.status(201).json({ photos: await photoList(id, adminBase(id)), max: maxPropertyPhotos })
  } catch (error) {
    console.error('Adding a property photo failed:', error)
    response.status(503).json({ error: 'The photo could not be saved.' })
  }
})

propertyPhotoAdminRouter.patch('/properties/:id/photos/:photoId', async (request, response) => {
  const { id, photoId } = request.params
  const caption = readCaption((request.body as { caption?: unknown }).caption)
  if ('error' in caption) { response.status(400).json({ error: caption.error }); return }
  try {
    const { count } = await prisma.propertyPhoto.updateMany({ where: { id: photoId, propertyId: id }, data: { caption: caption.caption } })
    if (!count) { response.status(404).json({ error: 'That photo was not found.' }); return }
    response.json({ photos: await photoList(id, adminBase(id)), max: maxPropertyPhotos })
  } catch (error) {
    console.error('Updating a photo caption failed:', error)
    response.status(503).json({ error: 'The caption could not be saved.' })
  }
})

propertyPhotoAdminRouter.delete('/properties/:id/photos/:photoId', async (request, response) => {
  const { id, photoId } = request.params
  try {
    await prisma.propertyPhoto.deleteMany({ where: { id: photoId, propertyId: id } })
    response.json({ photos: await photoList(id, adminBase(id)), max: maxPropertyPhotos })
  } catch (error) {
    console.error('Removing a property photo failed:', error)
    response.status(503).json({ error: 'The photo could not be removed.' })
  }
})

propertyPhotoAdminRouter.get('/properties/:id/photos/:photoId/image', async (request, response) => {
  try {
    await sendPhoto(response, { id: request.params.photoId, propertyId: request.params.id })
  } catch (error) {
    console.error('Property photo failed:', error)
    response.status(503).json({ error: 'The photo could not be loaded.' })
  }
})

/** Resident routes: only the photos of the resident's own property. */
export const propertyPhotoResidentRouter = Router()
const requireResident = requireRole(UserRole.RESIDENT)
const residentBase = '/api/resident-portal/photos'

propertyPhotoResidentRouter.get('/resident-portal/photos', requireResident, requirePortalAccess, requireResidentFeature('photos'), async (_request, response) => {
  try {
    response.json({ photos: await photoList(response.locals.propertyId as string, residentBase) })
  } catch (error) {
    console.error('Resident property photos failed:', error)
    response.status(503).json({ error: 'The photos could not be loaded.' })
  }
})

propertyPhotoResidentRouter.get('/resident-portal/photos/:photoId/image', requireResident, requirePortalAccess, requireResidentFeature('photos'), async (request, response) => {
  try {
    await sendPhoto(response, { id: String(request.params.photoId), propertyId: response.locals.propertyId as string })
  } catch (error) {
    console.error('Resident property photo failed:', error)
    response.status(503).json({ error: 'The photo could not be loaded.' })
  }
})
