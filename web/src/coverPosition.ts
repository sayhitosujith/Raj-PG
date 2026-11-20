import type { CSSProperties } from 'react'

/** Where the resident's own cover sits in the banner: focal point in percent (0-100) and zoom (1-3), as /me reports it. */
export type CoverPosition = { x: number; y: number; zoom: number }

type Size = { width: number; height: number }

/** A new or never-adjusted cover: the backend's defaults. */
export const centredCover: CoverPosition = { x: 50, y: 50, zoom: 1 }

export const maxCoverZoom = 3

const nudgeStep = 2
// Same direction as dragging: the arrow moves the picture, so ArrowRight lowers x.
const nudges: Record<string, [number, number]> = { ArrowLeft: [nudgeStep, 0], ArrowRight: [-nudgeStep, 0], ArrowUp: [0, nudgeStep], ArrowDown: [0, -nudgeStep] }

/**
 * The position after dragging the picture by (dx, dy) pixels from where the drag started. A percent of object-position
 * spans the image's overflow beyond the banner at its cover-fit size times the zoom, so the picture tracks the
 * pointer exactly; an axis with no overflow cannot move.
 */
export function dragCoverPosition(start: CoverPosition, dx: number, dy: number, banner: Size, image: Size): CoverPosition {
  if (!image.width || !image.height) return start
  const scale = Math.max(banner.width / image.width, banner.height / image.height) * start.zoom
  return { ...start, x: shift(start.x, dx, image.width * scale - banner.width), y: shift(start.y, dy, image.height * scale - banner.height) }
}

/** The position after an arrow key press, for keyboard users; null for any other key, so the caller lets it through. */
export function nudgeCoverPosition(position: CoverPosition, key: string): CoverPosition | null {
  const nudge = nudges[key]
  return nudge ? { ...position, x: clampPercent(position.x + nudge[0]), y: clampPercent(position.y + nudge[1]) } : null
}

/**
 * The own cover image's style. Scaling about the focal point keeps that point fixed, so the zoomed picture still
 * covers the banner for any focal point from 0 to 100.
 */
export function coverImageStyle({ x, y, zoom }: CoverPosition): CSSProperties {
  const origin = `${x}% ${y}%`
  return { objectPosition: origin, transformOrigin: origin, transform: zoom === 1 ? undefined : `scale(${zoom})` }
}

function shift(percent: number, delta: number, overflow: number) {
  return overflow > 0 ? clampPercent(percent - (delta / overflow) * 100) : percent
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}
