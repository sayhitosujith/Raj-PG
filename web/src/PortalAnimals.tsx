import type { CSSProperties, ReactNode } from 'react'

// Legs alternate between two phases (diagonal pairs swing together), which reads as a walk; each
// leg pivots at its own hip.
const legs = (positions: Array<[number, number]>, top: number, length: number, width: number) => (['a', 'b'] as const).map((group, groupIndex) => (
  <g key={group}>
    {positions.filter((_, index) => index % 2 === groupIndex).map(([x]) => <rect key={x} className={`animal-leg animal-leg-${group}`} x={x} y={top} width={width} height={length} rx={width / 2} />)}
  </g>
))

const deer = (
  <svg viewBox="0 0 64 52">
    {legs([[17, 0], [21, 0], [37, 0], [41, 0]], 28, 20, 2.6)}
    <ellipse cx="29" cy="26" rx="16" ry="7.5" />
    <path d="M38 22 L43 7 L48 8 L45 26 Z" />
    <ellipse cx="49" cy="8" rx="6" ry="3.4" />
    <path d="M44 4 L46 7 L47 5 Z" />
    <path className="animal-line" d="M45 5 L42 -3 M43 0 L39 -2 M47 5 L50 -3 M49 0 L53 -2" />
    <ellipse cx="13" cy="22" rx="3" ry="2" />
  </svg>
)

const fox = (
  <svg viewBox="0 0 56 28">
    {legs([[16, 0], [20, 0], [31, 0], [35, 0]], 16, 11, 2.2)}
    <ellipse cx="26" cy="15" rx="12" ry="5" />
    <path d="M36 12 L44 9 L52 14 L43 17 Z" />
    <path d="M42 10 L43 4 L46 9 Z" />
    <ellipse cx="9" cy="12" rx="9" ry="3.6" transform="rotate(-18 9 12)" />
  </svg>
)

const rabbit = (
  <svg viewBox="0 0 30 24">
    <ellipse cx="13" cy="16" rx="9" ry="6" />
    <circle cx="22" cy="11" r="4.2" />
    <ellipse cx="21" cy="4" rx="1.6" ry="5" transform="rotate(-12 21 4)" />
    <ellipse cx="24" cy="4.5" rx="1.6" ry="5" transform="rotate(10 24 4.5)" />
    <circle cx="4" cy="14" r="2.6" />
  </svg>
)

type Animal = { name: string; art: ReactNode; width: number; gait: 'walk' | 'hop'; duration: number; delay: number; leftward?: boolean; rest: string }

// Different speeds and head starts (negative delays) so they are spread out, never in a line.
const animals: Animal[] = [
  { name: 'deer', art: deer, width: 64, gait: 'walk', duration: 70, delay: -18, rest: '22%' },
  { name: 'fox', art: fox, width: 50, gait: 'walk', duration: 52, delay: -20, leftward: true, rest: '64%' },
  { name: 'rabbit', art: rabbit, width: 26, gait: 'hop', duration: 46, delay: -30, rest: '82%' },
]

/**
 * Animals crossing the forest floor behind the resident portal: a deer and a fox walking and a
 * rabbit hopping, in the tree line's colours. Purely decorative, like the scenery it sits on:
 * hidden from assistive tech, ignores the pointer, and stands still for reduced motion.
 */
export function PortalAnimals() {
  return (
    <div className="portal-animals" aria-hidden="true">
      {animals.map((animal) => (
        <div key={animal.name} className={`animal-walker${animal.leftward ? ' is-leftward' : ''}`} style={{ width: animal.width, '--walk-duration': `${animal.duration}s`, '--walk-delay': `${animal.delay}s`, '--walk-rest': animal.rest } as CSSProperties}>
          <div className={`animal animal-${animal.gait}`}>{animal.art}</div>
        </div>
      ))}
    </div>
  )
}
