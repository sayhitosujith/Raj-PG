/**
 * The home page hero's default artwork when no banner is uploaded: a flat skyline of apartment blocks,
 * small houses and trees under a sun and drifting clouds, drawn in SVG so it is sharp at any size.
 * Every colour comes from the site's brand colour (site.css), so it follows Views → Theme colour and
 * the dark view. It sits along the bottom; the headline stays on the open sky above.
 */

type Block = { x: number; y: number; width: number; columns: number; lit: number[] }

// Ground line of the 1440 × 460 drawing. The strip below it is deep enough for the "Scroll to explore" cue.
const ground = 396

const towers: Block[] = [
  { x: 190, y: 168, width: 150, columns: 3, lit: [4, 11, 19] },
  { x: 610, y: 236, width: 118, columns: 2, lit: [3, 8] },
  { x: 1050, y: 148, width: 162, columns: 3, lit: [1, 9, 16, 22] },
]

const houses = [
  { x: 405, width: 176, top: 328 },
  { x: 812, width: 204, top: 318 },
  { x: 1252, width: 150, top: 340 },
]

const trees = [
  { x: 118, radius: 34, height: 70 },
  { x: 372, radius: 24, height: 52 },
  { x: 598, radius: 30, height: 60 },
  { x: 786, radius: 22, height: 48 },
  { x: 1030, radius: 28, height: 58 },
  { x: 1232, radius: 20, height: 44 },
  { x: 1368, radius: 32, height: 66 },
]

// The far skyline: a ragged band of faint blocks behind everything.
const farSkyline = [[0, 300, 90], [90, 262, 70], [160, 318, 120], [280, 280, 60], [340, 246, 80], [420, 300, 110], [530, 270, 70], [600, 310, 130], [730, 258, 64], [794, 292, 96], [890, 240, 74], [964, 300, 110], [1074, 276, 60], [1134, 230, 70], [1204, 296, 120], [1324, 268, 66], [1390, 300, 50]]

function Tower({ x, y, width, columns, lit }: Block) {
  const windowWidth = 22
  const windowHeight = 16
  // As many floors as fit above the ground, with a margin, so no window is cut off.
  const rows = Math.floor((ground - y - 22 - 12) / 28)
  const gapX = (width - 24 - columns * windowWidth) / Math.max(columns - 1, 1)
  return (
    <g>
      <rect className="scene-tower" x={x} y={y} width={width} height={ground - y} />
      <rect className="scene-tower-side" x={x + width - 14} y={y} width={14} height={ground - y} />
      <rect className="scene-roof" x={x - 6} y={y - 12} width={width + 12} height={14} rx={3} />
      {Array.from({ length: rows * columns }, (_, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        return <rect key={index} className={lit.includes(index) ? 'scene-window is-lit' : 'scene-window'} x={x + 12 + column * (windowWidth + gapX)} y={y + 22 + row * 28} width={windowWidth} height={windowHeight} rx={2} />
      })}
    </g>
  )
}

function House({ x, width, top }: { x: number; width: number; top: number }) {
  const middle = x + width / 2
  return (
    <g>
      <polygon className="scene-roof" points={`${x - 10},${top} ${middle},${top - 46} ${x + width + 10},${top}`} />
      <rect className="scene-house" x={x} y={top} width={width} height={ground - top} />
      <rect className="scene-door" x={middle - 13} y={ground - 46} width={26} height={46} rx={3} />
      <rect className="scene-window is-lit" x={x + 18} y={top + 20} width={26} height={22} rx={2} />
      <rect className="scene-window" x={x + width - 44} y={top + 20} width={26} height={22} rx={2} />
    </g>
  )
}

function Cloud({ x, y, scale, className }: { x: number; y: number; scale: number; className: string }) {
  return (
    <g className={`scene-cloud ${className}`} transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx={0} cy={18} rx={64} ry={18} />
      <circle cx={-22} cy={6} r={22} />
      <circle cx={10} cy={-4} r={28} />
      <circle cx={38} cy={10} r={18} />
    </g>
  )
}

export function SiteHeroScene() {
  return (
    <svg className="site-hero-scene" viewBox="0 0 1440 460" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <circle className="scene-sun" cx={1150} cy={176} r={78} />
      {/* Kept low: on wide screens the drawing's top is trimmed (preserveAspectRatio slice). */}
      <Cloud x={470} y={205} scale={1} className="is-slow" />
      <Cloud x={890} y={185} scale={0.8} className="is-fast" />
      <Cloud x={1370} y={230} scale={0.85} className="is-slow" />
      {farSkyline.map(([x, y, width]) => <rect key={x} className="scene-far" x={x} y={y} width={width} height={ground - y} />)}
      {towers.map((tower) => <Tower key={tower.x} {...tower} />)}
      {houses.map((house) => <House key={house.x} {...house} />)}
      {trees.map(({ x, radius, height }) => (
        <g key={x}>
          <rect className="scene-trunk" x={x - 4} y={ground - height + radius} width={8} height={height - radius} rx={3} />
          <ellipse className="scene-tree" cx={x} cy={ground - height + radius / 2} rx={radius * 0.8} ry={radius} />
        </g>
      ))}
      <rect className="scene-ground" x={0} y={ground} width={1440} height={460 - ground} />
    </svg>
  )
}
