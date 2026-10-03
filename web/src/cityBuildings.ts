/**
 * The resident portal's skyline, drawn for a tall 1440 × 560 box so it reaches down to the trees
 * without being stretched: slim office towers far away, apartment blocks in the middle (rooftop water
 * tanks, balcony ledges, rows of windows), and low-rise buildings in front with larger windows.
 * Each layer's outlines, windows and ledges are single SVG paths (thousands of windows would be too
 * many elements); lit windows for the night sky are a path too, plus a few that flicker. Generated
 * from fixed seeds so the city looks the same on every visit and render.
 */

type Roof = 'flat' | 'antenna' | 'spire' | 'stepped' | 'tank' | 'dome'
type Building = { x: number; width: number; height: number; roof: Roof }
// `hiddenBelow`: skip rows lower than this height from the ground (covered by nearer layers anyway).
type WindowGrid = { width: number; height: number; gapX: number; gapY: number; inset: number; hiddenBelow?: number }

/** A window that slowly flickers when lit at night. */
export type CityWindow = { x: number; y: number; width: number; height: number; delay: number }

/** One layer's detail: glass (every window, seen by day), ledges, and the lights for the night. */
export type CityLayerDetail = { glass: string; ledges: string; lit: string; flicker: CityWindow[] }

export const cityViewBox = '0 0 1440 560'
const viewWidth = 1440
const viewHeight = 560

function seededRandom(seed: number) {
  let state = seed
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646 }
}

const round = (value: number) => Math.round(value * 10) / 10
const rect = (x: number, y: number, width: number, height: number) => `M${round(x)} ${round(y)}h${round(width)}v${round(height)}h${round(-width)}Z`

// Buildings side by side across the full width, slightly past both edges, with small gaps between.
function makeBuildings(seed: number, heights: [number, number], widths: [number, number], roofs: Roof[]): Building[] {
  const next = seededRandom(seed)
  const buildings: Building[] = []
  for (let x = -40; x < viewWidth + 40;) {
    const width = widths[0] + next() * (widths[1] - widths[0])
    buildings.push({ x, width, height: heights[0] + next() * (heights[1] - heights[0]), roof: roofs[Math.floor(next() * roofs.length)] })
    x += width + 2 + next() * 6
  }
  return buildings
}

// One building's outline including its roof feature (antenna, spire, setback, water tanks or dome).
function outline({ x, width, height, roof }: Building) {
  const top = viewHeight - height
  const right = x + width
  const middle = x + width / 2
  const body = `M${round(x)} ${viewHeight}V${round(top)}H${round(right)}V${viewHeight}Z`
  if (roof === 'antenna') return body + rect(middle - 1.2, top - 30, 2.4, 30) + rect(middle - 5, top - 6, 10, 6)
  if (roof === 'spire') return body + `M${round(x + width * 0.3)} ${round(top)}L${round(middle)} ${round(top - 42)}L${round(x + width * 0.7)} ${round(top)}Z`
  if (roof === 'stepped') return body + rect(x + width * 0.14, top - 16, width * 0.72, 16) + rect(x + width * 0.3, top - 28, width * 0.4, 12)
  if (roof === 'tank') return body + rect(x + width * 0.12, top - 12, width * 0.2, 12) + rect(x + width * 0.58, top - 16, width * 0.26, 16) + rect(x + width * 0.06, top - 3, width * 0.88, 3)
  if (roof === 'dome') return body + `M${round(x + width * 0.25)} ${round(top)}Q${round(middle)} ${round(top - width * 0.5)} ${round(x + width * 0.75)} ${round(top)}Z`
  return body + rect(x + width * 0.04, top - 3, width * 0.92, 3)
}

/**
 * Windows in a grid on every building (the glass you see by day), balcony ledges under each row when
 * `withLedges`, and about `litShare` of the windows lit for the night, a few of them flickering.
 */
function detail(buildings: Building[], seed: number, grid: WindowGrid, litShare: number, withLedges: boolean): CityLayerDetail {
  const next = seededRandom(seed)
  let glass = ''
  let ledges = ''
  let lit = ''
  const flicker: CityWindow[] = []
  for (const building of buildings) {
    const top = viewHeight - building.height
    const columns = Math.floor((building.width - grid.inset * 2 + grid.gapX) / (grid.width + grid.gapX))
    if (columns < 1) continue
    // Centre the grid so the side margins match.
    const left = building.x + (building.width - (columns * grid.width + (columns - 1) * grid.gapX)) / 2
    const lowest = viewHeight - Math.max(grid.inset, grid.hiddenBelow ?? 0)
    for (let y = top + grid.inset + 4; y + grid.height < lowest; y += grid.height + grid.gapY) {
      if (withLedges) ledges += rect(building.x - 1.5, y + grid.height + 1.5, building.width + 3, 2)
      for (let column = 0; column < columns; column += 1) {
        const x = left + column * (grid.width + grid.gapX)
        glass += rect(x, y, grid.width, grid.height)
        if (next() < litShare) {
          if (flicker.length < 36 && next() < 0.06) flicker.push({ x: round(x), y: round(y), width: grid.width, height: grid.height, delay: round(next() * 8) })
          else lit += rect(x, y, grid.width, grid.height)
        }
      }
    }
  }
  return { glass, ledges, lit, flicker }
}

const far = makeBuildings(5, [250, 470], [26, 62], ['antenna', 'spire', 'flat', 'stepped', 'antenna', 'dome'])
const middle = makeBuildings(13, [150, 330], [48, 98], ['tank', 'flat', 'tank', 'stepped', 'antenna', 'tank'])
const near = makeBuildings(29, [70, 170], [60, 132], ['tank', 'flat', 'flat', 'tank'])

/** Each layer's building outlines as one path, back to front. */
export const skyline = { far: far.map(outline).join(''), middle: middle.map(outline).join(''), near: near.map(outline).join('') }

/** Windows, ledges and night lights per layer: tiny strips far away, apartment grids, then larger panes in front. */
export const cityDetail = {
  far: detail(far, 41, { width: 3, height: 6, gapX: 6, gapY: 10, inset: 6, hiddenBelow: 230 }, 0.14, false),
  middle: detail(middle, 57, { width: 6, height: 8, gapX: 7, gapY: 10, inset: 8 }, 0.24, true),
  near: detail(near, 71, { width: 10, height: 12, gapX: 10, gapY: 14, inset: 10 }, 0.3, false),
}
