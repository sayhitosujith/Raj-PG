/** Side of the generated tab icon; 64px stays sharp on high-density screens. */
const iconSide = 64

// Logos are often uploaded on a white background rather than a transparent one, so near-white
// pixels count as empty too.
const isInk = (data: Uint8ClampedArray, index: number) => data[index + 3] > 40 && data[index] + data[index + 1] + data[index + 2] < 690

/**
 * Builds a square tab icon from the uploaded logo. A logo is usually a symbol stacked above the
 * business name, which is unreadable at tab size, so this keeps only the top block (everything
 * above the first clear horizontal gap), trims its margins and fills the square with it.
 */
export async function logoFavicon(source: string): Promise<string> {
  const image = new Image()
  image.src = source
  await image.decode()
  const { naturalWidth: width, naturalHeight: height } = image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return source
  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, width, height)
  const rowHasInk = (y: number) => {
    for (let x = 0; x < width; x++) if (isInk(data, (y * width + x) * 4)) return true
    return false
  }

  let top = 0
  while (top < height && !rowHasInk(top)) top++
  if (top === height) return source

  // A run of empty rows this tall separates the symbol from the text beneath it; thinner runs are
  // just spacing inside the symbol.
  const minGap = Math.max(2, Math.round(height * 0.03))
  let bottom = top
  for (let y = top, emptyRun = 0; y < height; y++) {
    if (rowHasInk(y)) { bottom = y; emptyRun = 0 } else if (++emptyRun >= minGap) break
  }

  let left = width
  let right = 0
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (isInk(data, (y * width + x) * 4)) { left = Math.min(left, x); right = Math.max(right, x) }
    }
  }

  const blockWidth = right - left + 1
  const blockHeight = bottom - top + 1
  const scale = iconSide / Math.max(blockWidth, blockHeight)
  const icon = document.createElement('canvas')
  icon.width = iconSide
  icon.height = iconSide
  const iconContext = icon.getContext('2d')
  if (!iconContext) return source
  iconContext.drawImage(image, left, top, blockWidth, blockHeight, (iconSide - blockWidth * scale) / 2, (iconSide - blockHeight * scale) / 2, blockWidth * scale, blockHeight * scale)
  return icon.toDataURL('image/png')
}
