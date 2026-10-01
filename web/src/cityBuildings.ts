/**
 * The resident portal's skyline: three layers of buildings in a 1440 × 320 box (far towers, a
 * middle row, low-rise in front), each one combined SVG path, plus window positions for the two
 * nearer layers. Generated from fixed seeds so the city looks the same on every visit and render.
 */

type Roof = 'flat' | 'spire' | 'antenna' | 'stepped' | 'dome'
type Building = { x: number; width: number; height: number; roof: Roof }

/** A window's position, and whether it slowly flickers when lit. */
export type CityWindow = { x: number; y: number; twinkle: boolean; delay: number }

const viewWidth = 1440
const viewHeight = 320

function seededRandom(seed: number) {
  let state = seed
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646 }
}

// Buildings side by side across the full width, slightly past both edges so none ends abruptly.
function makeBuildings(seed: number, heights: [number, number], widths: [number, number], roofs: Roof[]): Building[] {
  const next = seededRandom(seed)
  const buildings: Building[] = []
  for (let x = -30; x < viewWidth + 30;) {
    const width = widths[0] + next() * (widths[1] - widths[0])
    buildings.push({ x, width, height: heights[0] + next() * (heights[1] - heights[0]), roof: roofs[Math.floor(next() * roofs.length)] })
    x += width + next() * 5
  }
  return buildings
}

// One building's outline, roof feature included.
function outline({ x, width, height, roof }: Building) {
  const top = viewHeight - height
  const right = x + width
  const middle = x + width / 2
  if (roof === 'spire') return `M${x} ${viewHeight}V${top}H${x + width * 0.4}L${middle} ${top - 30}L${x + width * 0.6} ${top}H${right}V${viewHeight}Z`
  if (roof === 'antenna') return `M${x} ${viewHeight}V${top}H${middle - 1.5}V${top - 26}H${middle + 1.5}V${top}H${right}V${viewHeight}Z`
  if (roof === 'stepped') return `M${x} ${viewHeight}V${top}H${x + width * 0.18}V${top - 14}H${x + width * 0.82}V${top}H${right}V${viewHeight}Z`
  if (roof === 'dome') return `M${x} ${viewHeight}V${top}H${x + width * 0.2}Q${middle} ${top - width * 0.45} ${x + width * 0.8} ${top}H${right}V${viewHeight}Z`
  return `M${x} ${viewHeight}V${top}H${right}V${viewHeight}Z`
}

// A grid of windows per building, about a fifth of them lit and a few of those flickering.
function makeWindows(buildings: Building[], seed: number, spacing: { x: number; y: number }): CityWindow[] {
  const next = seededRandom(seed)
  return buildings.flatMap((building) => {
    const windows: CityWindow[] = []
    for (let y = viewHeight - building.height + 10; y < viewHeight - 10; y += spacing.y) {
      for (let x = building.x + 6; x < building.x + building.width - 8; x += spacing.x) {
        if (next() < 0.2) windows.push({ x, y, twinkle: next() < 0.1, delay: next() * 8 })
      }
    }
    return windows
  })
}

const far = makeBuildings(5, [120, 235], [34, 80], ['flat', 'spire', 'antenna', 'antenna', 'stepped'])
const middle = makeBuildings(13, [80, 170], [44, 100], ['flat', 'flat', 'stepped', 'dome', 'antenna'])
const near = makeBuildings(29, [36, 105], [50, 120], ['flat', 'flat', 'flat', 'stepped'])

/** Each layer's buildings as one path, back to front. */
export const skyline = { far: far.map(outline).join(''), middle: middle.map(outline).join(''), near: near.map(outline).join('') }

/** Windows on the middle and near layers, drawn just above each layer so nearer buildings cover them. */
export const cityWindows = { middle: makeWindows(middle, 41, { x: 11, y: 14 }), near: makeWindows(near, 57, { x: 12, y: 15 }) }
