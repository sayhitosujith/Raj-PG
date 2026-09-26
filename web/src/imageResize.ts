// Phone photos are often 5–10 MB; anything beyond this is not an image worth decoding.
const maxOriginalBytes = 15_000_000
/** Edge length of stored profile photos, in pixels; plenty for a 2× display at 88 px. */
const photoSize = 256
/** Longest side of a stored logo, in pixels; enough for a crisp 2× sidebar mark. */
const logoMaxSide = 400

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
export async function resizeLogo(file: File): Promise<Result> {
  const bitmap = await decode(file)
  if ('error' in bitmap) return bitmap
  const scale = Math.min(1, logoMaxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = draw(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), [0, 0, bitmap.width, bitmap.height])
  return canvas ? { dataUrl: canvas.toDataURL('image/png') } : { error: 'Your browser could not process the image.' }
}
