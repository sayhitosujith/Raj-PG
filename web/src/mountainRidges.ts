/**
 * Natural-looking mountain ranges for the resident portal sky, as SVG paths in a 1440×320 box.
 *
 * Each range is a few pointed peaks for its overall shape, roughened by seeded midpoint
 * displacement: the fractal that makes real ridgelines look craggy at every scale. Every range
 * also gets a shaded face (the slope away from the sun; not the low foothills, where it reads as
 * streaks) and the far range a jagged snow line.
 * Seeded, so the skyline is identical on every visit and render.
 */
const WIDTH = 1440
const HEIGHT = 320
const SEGMENTS = 256
// Keeps the tallest summit inside the box, so no peak is cut flat by the top edge.
const TOP_MARGIN = 14

/** A peak: where it stands, how tall it rises above the range's base, and how quickly its slopes fall away. */
type Peak = { x: number; height: number; spread: number }

type Range = { seed: number; base: number; peaks: Peak[]; roughness: number }

function seededRandom(seed: number) {
  let state = seed
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646 - 0.5 }
}

// Midpoint displacement: each pass halves the segments and nudges every new midpoint by a random
// amount that shrinks with each pass (by `decay`), giving big bumps with finer crags on top.
function displacement(roughness: number, seed: number, decay = 0.7) {
  const random = seededRandom(seed)
  const offsets = new Array<number>(SEGMENTS + 1).fill(0)
  let amplitude = roughness
  for (let step = SEGMENTS; step > 1; step /= 2) {
    for (let start = 0; start < SEGMENTS; start += step) {
      const mid = start + step / 2
      offsets[mid] = (offsets[start] + offsets[start + step]) / 2 + random() * amplitude
    }
    amplitude *= decay
  }
  return offsets
}

const xAt = (index: number) => (index / SEGMENTS) * WIDTH
const toPath = (points: Array<[number, number]>) => `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`

function buildRange({ seed, base, peaks, roughness }: Range) {
  const offsets = displacement(roughness, seed)
  // exp(-|dx|) rather than a bell curve: slopes meet in a point, as real summits do.
  const ys = offsets.map((offset, index) => base + offset - peaks.reduce((sum, peak) => sum + peak.height * Math.exp(-Math.abs(xAt(index) - peak.x) / peak.spread), 0))
  const lift = Math.max(0, TOP_MARGIN - Math.min(...ys))
  const ridge = ys.map((y, index) => [xAt(index), Math.min(HEIGHT, y + lift)] as [number, number])

  // The shaded face of each peak: a wedge from its summit down to the left (the sun is up on the
  // right), later clipped to the range so only the mountain's own slope darkens.
  // The edge from the summit down is jittered, like a real rock ridge, rather than a ruler line.
  const jitter = seededRandom(seed + 1)
  const shade = peaks.map((peak) => {
    const window = ridge.filter(([x]) => Math.abs(x - peak.x) < peak.spread * 0.6)
    const [summitX, summitY] = window.reduce((top, point) => point[1] < top[1] ? point : top, window[0] ?? [peak.x, base])
    const edge = Array.from({ length: 14 }, (_, step) => {
      const t = (step + 1) / 14
      return [summitX + peak.spread * 0.25 * t + jitter() * 10 * t, summitY + (HEIGHT - summitY) * t] as [number, number]
    })
    return toPath([[summitX, summitY - 2], ...edge, [summitX - peak.spread * 2.2, HEIGHT]])
  }).join(' ')

  return { ridge: toPath([...ridge, [WIDTH, HEIGHT], [0, HEIGHT]]), shade }
}

/** A craggy snow line across the far range: everything above it is snow. */
function snowLine(seed: number, level: number) {
  const offsets = displacement(34, seed, 0.72)
  return toPath([[0, 0], ...offsets.map((offset, index) => [xAt(index), level + offset] as [number, number]), [WIDTH, 0]])
}

/** Back to front: tall snow-capped far peaks, a mid range, and low near foothills. */
export const ranges = {
  far: buildRange({ seed: 11, base: 240, roughness: 80, peaks: [{ x: 150, height: 110, spread: 70 }, { x: 470, height: 160, spread: 80 }, { x: 650, height: 95, spread: 55 }, { x: 860, height: 185, spread: 85 }, { x: 1180, height: 150, spread: 90 }, { x: 1420, height: 100, spread: 60 }] }),
  mid: buildRange({ seed: 23, base: 262, roughness: 60, peaks: [{ x: 60, height: 65, spread: 110 }, { x: 330, height: 100, spread: 120 }, { x: 700, height: 80, spread: 110 }, { x: 1030, height: 105, spread: 125 }, { x: 1340, height: 75, spread: 100 }] }),
  near: buildRange({ seed: 37, base: 284, roughness: 36, peaks: [{ x: 200, height: 50, spread: 170 }, { x: 610, height: 36, spread: 140 }, { x: 960, height: 55, spread: 180 }, { x: 1310, height: 42, spread: 150 }] }),
}

/** The region above the snow line; the far range is clipped to it to draw the snow caps. */
export const snowRegion = snowLine(53, 118)
