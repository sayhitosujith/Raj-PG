/** Where the resident's own Profile cover image sits in the banner: focal point in percent (0-100) and zoom (1-3). */
export type CoverPosition = { x: number; y: number; zoom: number }

const maxZoom = 3

/**
 * Reads a PATCH body into a cover position, or the reason it is unusable. Out-of-range values are refused rather
 * than clamped, because the portal clamps while dragging, so anything outside the range is a broken client.
 */
export function parseCoverPosition(body: unknown): { position: CoverPosition } | { error: string } {
  const { x, y, zoom } = (body ?? {}) as Record<string, unknown>
  if (!isBetween(x, 0, 100) || !isBetween(y, 0, 100)) return { error: 'The cover position must be two numbers from 0 to 100.' }
  if (!isBetween(zoom, 1, maxZoom)) return { error: `The cover zoom must be a number from 1 to ${maxZoom}.` }
  return { position: { x, y, zoom } }
}

/** The stored columns as the portal's coverPosition; null when the resident has no cover of their own. */
export function toCoverPosition(cover: { positionX: number; positionY: number; zoom: number } | null | undefined): CoverPosition | null {
  return cover ? { x: cover.positionX, y: cover.positionY, zoom: cover.zoom } : null
}

function isBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
