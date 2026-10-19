import { createHash } from 'node:crypto'
import type { Response } from 'express'

const imageDataUrlPattern = /^data:(image\/jpeg|image\/png|image\/webp);base64,(.+)$/s
// The browser resizes before upload (photos 256×256, logos ≤400px, QR images ≤1000px), so these
// only stop raw originals.
const maxProfilePhotoBytes = 300_000
const maxLogoBytes = 600_000
const maxUpiQrBytes = 1_500_000
const maxMaintenancePhotoBytes = 1_500_000
const maxPropertyPhotoBytes = 1_500_000
const maxBannerBytes = 3_000_000

/** Why an uploaded image is unacceptable, or null. Only raster types a browser can display safely. */
function findImageProblem(dataUrl: unknown, maxBytes: number, label: string) {
  if (typeof dataUrl !== 'string') return `Choose ${label} to upload.`
  const match = dataUrl.match(imageDataUrlPattern)
  if (!match) return `${label[0].toUpperCase()}${label.slice(1)} must be a JPG, PNG, or WebP image.`
  // Base64 encodes 3 bytes in 4 characters, so the size is known without decoding.
  if (Math.floor(match[2].length * 3 / 4) > maxBytes) return `${label[0].toUpperCase()}${label.slice(1)} is too large.`
  return null
}

/**
 * Sends a stored image, or 404 when there is none. Image URLs carry a version query
 * (`?v=<updatedAt>`), so a long cache is safe: a new upload gets a new URL.
 */
function sendImage(response: Response, dataUrl: string | null | undefined, cacheScope: 'private' | 'public', missing: string) {
  const match = dataUrl?.match(imageDataUrlPattern)
  if (!match) { response.status(404).json({ error: missing }); return }
  response.set({ 'Content-Type': match[1], 'Cache-Control': `${cacheScope}, max-age=31536000, immutable`, 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(match[2], 'base64'))
}

/** Why an uploaded profile photo is unacceptable, or null when it is fine. */
export const findProfilePhotoProblem = (dataUrl: unknown) => findImageProblem(dataUrl, maxProfilePhotoBytes, 'a photo')

/** Sends a stored profile photo (private: only signed-in owners and the resident see it). */
export const sendProfilePhoto = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'private', 'No profile photo.')

/** Sends a property worker's photo (private: only signed-in staff see it). Same 256×256 size as profile photos. */
export const sendWorkerPhoto = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'private', 'No photo.')

/** Why an uploaded workspace logo is unacceptable, or null when it is fine. */
export const findLogoProblem = (dataUrl: unknown) => findImageProblem(dataUrl, maxLogoBytes, 'a logo')

/** Serves a property's uploaded image to its residents. */
export const sendPropertyImage = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'private', 'No property image.')

/** Sends the workspace logo; public because the sign-in page shows it before anyone signs in. */
export const sendLogo = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'public', 'No logo.')

/** Why a photo attached to a maintenance request is unacceptable, or null when it is fine. */
export const findMaintenancePhotoProblem = (dataUrl: unknown) => findImageProblem(dataUrl, maxMaintenancePhotoBytes, 'a photo')

/** Sends a maintenance request's photo (private: the resident who raised it and owners). */
export const sendMaintenancePhoto = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'private', 'No photo.')

/** Why an uploaded UPI QR image is unacceptable, or null when it is fine. */
export const findUpiQrProblem = (dataUrl: unknown) => findImageProblem(dataUrl, maxUpiQrBytes, 'a QR image')

/** Sends the owner's UPI QR image (private: only signed-in residents and owners see it). */
export const sendUpiQr = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'private', 'No UPI QR image.')

/** Version used in image URLs; null means there is no image. */
export function photoVersion(updatedAt: Date | null | undefined) {
  return updatedAt ? updatedAt.getTime() : null
}

/** Why a property gallery photo is unacceptable, or null when it is fine (resized to ≤1920px in the browser). */
export const findPropertyPhotoProblem = (dataUrl: unknown) => findImageProblem(dataUrl, maxPropertyPhotoBytes, 'a photo')

/** Why an uploaded website banner is unacceptable, or null when it is fine (resized to ≤2560px in the browser). */
export const findBannerProblem = (dataUrl: unknown) => findImageProblem(dataUrl, maxBannerBytes, 'a banner image')

/** Sends the website banner; public, as the website shows it to every visitor. */
export const sendBanner = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'public', 'No banner image.')

/** Sends a property cover or gallery photo to anyone: the public website shows them to visitors. */
export const sendPublicPropertyPhoto = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'public', 'No photo.')

/** A short hash of an inline image for its URL, so browsers cache it until the image changes. */
export const contentVersion = (dataUrl: string) => createHash('sha1').update(dataUrl).digest('hex').slice(0, 10)

/** Sends a property gallery photo (private: the property's residents and owners). */
export const sendPropertyPhoto = (response: Response, dataUrl: string | null | undefined) => sendImage(response, dataUrl, 'private', 'No photo.')
