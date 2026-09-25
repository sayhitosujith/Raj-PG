import type { Response } from 'express'

const profilePhotoDataUrlPattern = /^data:(image\/jpeg|image\/png|image\/webp);base64,(.+)$/s
// The browser resizes to 256×256 before upload (~20–40 KB), so this only stops raw originals.
const maxProfilePhotoBytes = 300_000

/** Why an uploaded profile photo is unacceptable, or null when it is fine. */
export function findProfilePhotoProblem(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') return 'Choose a photo to upload.'
  const match = dataUrl.match(profilePhotoDataUrlPattern)
  if (!match) return 'Profile photo must be a JPG, PNG, or WebP image.'
  if (Math.floor(match[2].length * 3 / 4) > maxProfilePhotoBytes) return 'Profile photo is too large.'
  return null
}

/**
 * Sends a stored profile photo, or 404 when there is none. Photo URLs carry a version query
 * (`?v=<updatedAt>`), so a long private cache is safe: a new photo gets a new URL.
 */
export function sendProfilePhoto(response: Response, dataUrl: string | null | undefined) {
  const match = dataUrl?.match(profilePhotoDataUrlPattern)
  if (!match) { response.status(404).json({ error: 'No profile photo.' }); return }
  response.set({ 'Content-Type': match[1], 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(match[2], 'base64'))
}

/** Version used in photo URLs; null means the resident has no photo. */
export function photoVersion(updatedAt: Date | null | undefined) {
  return updatedAt ? updatedAt.getTime() : null
}
