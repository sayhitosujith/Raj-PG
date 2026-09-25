/** Edge length of stored profile photos, in pixels; plenty for a 2× display at 88 px. */
const photoSize = 256
// Phone photos are often 5–10 MB; anything beyond this is not a photo worth decoding.
const maxOriginalBytes = 15_000_000

/**
 * Centre-crops an image to a square and shrinks it to 256×256 JPEG in the browser, so a
 * multi-megabyte phone photo uploads as ~20–40 KB. EXIF rotation is honoured by the decoder.
 */
export async function resizeToSquareJpeg(file: File): Promise<{ dataUrl: string } | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file (JPG, PNG, WebP or HEIC).' }
  if (file.size > maxOriginalBytes) return { error: 'That image is too large. Choose one under 15 MB.' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return { error: 'That image could not be read. Try a JPG or PNG.' }
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = photoSize
  canvas.height = photoSize
  const context = canvas.getContext('2d')
  if (!context) return { error: 'Your browser could not process the image.' }
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, photoSize, photoSize)
  bitmap.close()
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85) }
}
