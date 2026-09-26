import type { CSSProperties } from 'react'

type Tree = { shape: 'pine' | 'round'; x: number; scale: number; row: 'back' | 'front'; duration: number; delay: number }

// Hand-placed so the skyline looks natural: taller back row, smaller front row, with varied
// durations and negative delays so no two trees sway in step.
const trees: Tree[] = [
  { shape: 'pine', x: 60, scale: 1.3, row: 'back', duration: 7, delay: -1 },
  { shape: 'round', x: 170, scale: 1.1, row: 'back', duration: 9, delay: -4 },
  { shape: 'pine', x: 300, scale: 1.6, row: 'back', duration: 8, delay: -2 },
  { shape: 'round', x: 520, scale: 1.2, row: 'back', duration: 10, delay: -6 },
  { shape: 'pine', x: 690, scale: 1.4, row: 'back', duration: 7.5, delay: -3 },
  { shape: 'pine', x: 900, scale: 1.7, row: 'back', duration: 8.5, delay: -5 },
  { shape: 'round', x: 1080, scale: 1.3, row: 'back', duration: 9.5, delay: -1.5 },
  { shape: 'pine', x: 1250, scale: 1.5, row: 'back', duration: 7, delay: -4.5 },
  { shape: 'round', x: 1390, scale: 1.1, row: 'back', duration: 10, delay: -2.5 },
  { shape: 'round', x: 110, scale: 0.8, row: 'front', duration: 6.5, delay: -2 },
  { shape: 'pine', x: 240, scale: 0.9, row: 'front', duration: 6, delay: -3.5 },
  { shape: 'pine', x: 420, scale: 1, row: 'front', duration: 7, delay: -1 },
  { shape: 'round', x: 790, scale: 0.9, row: 'front', duration: 6.5, delay: -5 },
  { shape: 'pine', x: 1000, scale: 0.85, row: 'front', duration: 6, delay: -2.5 },
  { shape: 'round', x: 1180, scale: 0.95, row: 'front', duration: 7, delay: -4 },
  { shape: 'pine', x: 1340, scale: 0.9, row: 'front', duration: 6.5, delay: -0.5 },
]

/**
 * Decorative swaying tree line fixed to the bottom of the resident portal, behind the content.
 * Purely visual: hidden from assistive tech, ignores the pointer, and stills for reduced motion.
 */
export function PortalScenery() {
  return (
    <svg className="portal-scenery" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        {/* Each shape is drawn with its trunk base at 0,0 so it sways from the ground. */}
        <g id="scenery-pine"><rect x="-3" y="-14" width="6" height="14" /><polygon points="0,-100 -22,-58 22,-58" /><polygon points="0,-80 -30,-34 30,-34" /><polygon points="0,-60 -38,-12 38,-12" /></g>
        <g id="scenery-round"><rect x="-4" y="-42" width="8" height="42" /><circle cx="0" cy="-72" r="30" /><circle cx="-22" cy="-54" r="22" /><circle cx="22" cy="-54" r="22" /></g>
      </defs>
      <path className="scenery-back" d="M0 200 Q 240 170 480 188 T 960 184 T 1440 190 V220 H0 Z" />
      {(['back', 'front'] as const).map((row) => (
        <g key={row} className={`scenery-${row}`}>
          {trees.filter((tree) => tree.row === row).map((tree) => (
            <g key={`${tree.shape}-${tree.x}`} transform={`translate(${tree.x} ${row === 'back' ? 196 : 214}) scale(${tree.scale})`}>
              <g className="scenery-sway" style={{ '--sway-duration': `${tree.duration}s`, '--sway-delay': `${tree.delay}s` } as CSSProperties}><use href={`#scenery-${tree.shape}`} /></g>
            </g>
          ))}
        </g>
      ))}
      <path className="scenery-front" d="M0 212 Q 360 198 720 208 T 1440 206 V220 H0 Z" />
    </svg>
  )
}
