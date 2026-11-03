import { useEffect, useState } from 'react'

// How far (0–441, RGB distance) a pixel may be from the background colour and still count as background; a
// band beyond it fades out, so anti-aliased edges blend instead of leaving a pale fringe.
const tolerance = 40
const feather = 30

const results = new Map<string, Promise<string>>()

const distance = (data: Uint8ClampedArray, i: number, [r, g, b]: number[]) => Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b)

/**
 * The logo at `src` with its plain background made transparent: the background colour (the commonest opaque colour
 * along the edges) is cleared by filling inwards from the edges, so the same colour inside the logo (white text in
 * a coloured house) is kept. A logo that is already transparent, or has no plain background, comes back unchanged.
 */
function withoutBackground(src: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      // An image from another site cannot be read back from a canvas (the browser refuses), so it is shown as it is.
      try { resolve(processImage(image, src)) } catch { resolve(src) }
    }
    // Shown as uploaded if it cannot be read (a broken file).
    image.onerror = () => resolve(src)
    image.src = src
  })
}

function processImage(image: HTMLImageElement, src: string): string {
  const { naturalWidth: width, naturalHeight: height } = image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || !width || !height) return src
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height)
  const { data } = pixels
  const edge: number[] = []
  for (let x = 0; x < width; x += 1) edge.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y += 1) edge.push(y * width, y * width + width - 1)
  // The background colour: the commonest opaque edge colour, roughly bucketed. Mostly transparent edges mean
  // the logo already has a transparent background.
  const counts = new Map<number, { count: number; color: number[] }>()
  let opaque = 0
  for (const pixel of edge) {
    const i = pixel * 4
    if (data[i + 3] < 200) continue
    opaque += 1
    const key = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | data[i + 2] >> 4
    const bucket = counts.get(key) ?? { count: 0, color: [data[i], data[i + 1], data[i + 2]] }
    bucket.count += 1
    counts.set(key, bucket)
  }
  const background = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  if (!background || opaque < edge.length / 2 || background.count < opaque / 2) return src
  // Flood fill from every edge pixel through background-coloured (or already transparent) pixels.
  const seen = new Uint8Array(width * height)
  const queue = edge.filter((pixel) => !seen[pixel] && (seen[pixel] = 1))
  while (queue.length) {
    const pixel = queue.pop() as number
    const i = pixel * 4
    const gap = distance(data, i, background.color)
    if (data[i + 3] > 0 && gap > tolerance + feather) continue
    data[i + 3] = gap <= tolerance ? 0 : Math.min(data[i + 3], Math.round(255 * (gap - tolerance) / feather))
    // Only spread through clear background: a feathered pixel is the logo's edge.
    if (gap > tolerance && data[i + 3] > 0) continue
    const x = pixel % width
    for (const next of [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, pixel - width, pixel + width]) {
      if (next >= 0 && next < width * height && !seen[next]) { seen[next] = 1; queue.push(next) }
    }
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * `src` with its plain background removed, for a logo (or a property image that is a logo) that should sit on any
 * background; a photo has no plain background and is left as it is; the original is shown
 * until that is ready, and each image is only processed once per page load.
 */
export function useTransparentLogo(src: string | null) {
  const [processed, setProcessed] = useState<{ src: string; result: string } | null>(null)
  useEffect(() => {
    if (!src) return
    let isCurrent = true
    if (!results.has(src)) results.set(src, withoutBackground(src))
    void results.get(src)?.then((result) => { if (isCurrent) setProcessed({ src, result }) })
    return () => { isCurrent = false }
  }, [src])
  return src && processed?.src === src ? processed.result : src
}
