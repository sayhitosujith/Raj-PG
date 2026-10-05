// Phone photos are often 5–10 MB; anything beyond this is not an image worth decoding.
const maxOriginalBytes = 15_000_000
/** Edge length of stored profile photos, in pixels; plenty for a 2× display at 88 px. */
const photoSize = 256
/** Longest side of a stored logo, in pixels; enough for a crisp 2× sidebar mark. */
const logoMaxSide = 400
/** Longest side of a stored UPI QR image; enough for a phone to scan it off another screen. */
const upiQrMaxSide = 1000
/** Longest side of a stored property photo. Kept modest: the owner dashboard, refreshed every minute (see slowRefreshIntervalMs), embeds every property photo. */
const propertyPhotoMaxSide = 1200

type Result = { dataUrl: string } | { error: string }

async function decode(file: File): Promise<ImageBitmap | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file (JPG, PNG, WebP or HEIC).' }
  if (file.size > maxOriginalBytes) return { error: 'That image is too large. Choose one under 15 MB.' }
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return { error: 'That image could not be read. Try a JPG or PNG.' }
  }
}

function draw(bitmap: ImageBitmap, width: number, height: number, source: [number, number, number, number]) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, ...source, 0, 0, width, height)
  bitmap.close()
  return canvas
}

/**
 * Centre-crops an image to a square and shrinks it to 256×256 JPEG in the browser, so a
 * multi-megabyte phone photo uploads as ~20–40 KB. EXIF rotation is honoured by the decoder.
 */
export async function resizeToSquareJpeg(file: File): Promise<Result> {
  const bitmap = await decode(file)
  if ('error' in bitmap) return bitmap
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = draw(bitmap, photoSize, photoSize, [(bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side])
  return canvas ? { dataUrl: canvas.toDataURL('image/jpeg', 0.85) } : { error: 'Your browser could not process the image.' }
}

/**
 * Shrinks a logo to fit 400px on its longest side without cropping, as PNG so transparent
 * backgrounds survive. Smaller images are kept at their size.
 */
export const resizeLogo = (file: File) => resizeToFitPng(file, logoMaxSide)

/**
 * Shrinks an owner's UPI QR image (often a full-page merchant poster) to 1000px on its longest
 * side, as PNG: lossless keeps the QR's sharp edges scannable, and flat images compress well.
 */
export const resizeUpiQr = (file: File) => resizeToFitPng(file, upiQrMaxSide)

// True when any pixel is see-through, i.e. the image relies on transparency (a logo-style PNG).
function hasTransparency(canvas: HTMLCanvasElement) {
  const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
  if (!pixels) return false
  for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha] < 255) return true
  return false
}

/**
 * Shrinks a property photo to 1200px on its longest side, without cropping. Ordinary photos become
 * JPEG (5–10 MB phone photos upload as roughly 150–250 KB). JPEG cannot store transparency, so an
 * image with a transparent background is kept as WebP instead (PNG where the browser cannot encode
 * WebP); otherwise its transparent areas turned black.
 */
export async function resizePropertyPhoto(file: File): Promise<Result> {
  const bitmap = await decode(file)
  if ('error' in bitmap) return bitmap
  const scale = Math.min(1, propertyPhotoMaxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = draw(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), [0, 0, bitmap.width, bitmap.height])
  if (!canvas) return { error: 'Your browser could not process the image.' }
  return { dataUrl: hasTransparency(canvas) ? canvas.toDataURL('image/webp', 0.9) : canvas.toDataURL('image/jpeg', 0.8) }
}

async function resizeToFitPng(file: File, maxSide: number): Promise<Result> {
  const bitmap = await decode(file)
  if ('error' in bitmap) return bitmap
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = draw(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), [0, 0, bitmap.width, bitmap.height])
  return canvas ? { dataUrl: canvas.toDataURL('image/png') } : { error: 'Your browser could not process the image.' }
}
