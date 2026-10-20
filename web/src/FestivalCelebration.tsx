import type { CSSProperties } from 'react'
import { PartyPopper } from 'lucide-react'
import { seededRandom } from './SkyBackdrop'

// Festive colours that read on both the day and the night sky: gold, saffron, pink, violet, teal.
const colours = ['#facc15', '#fb923c', '#f472b6', '#a78bfa', '#2dd4bf', '#f87171']

// Firework bursts: where each goes off in the sky band (%), its size, and when in the loop it fires,
// staggered so there is always one blooming somewhere.
const bursts = [
  { x: 18, y: 24, size: 1, delay: 0 },
  { x: 72, y: 16, size: 1.25, delay: 0.9 },
  { x: 46, y: 34, size: 0.8, delay: 1.7 },
  { x: 86, y: 38, size: 0.9, delay: 2.5 },
  { x: 32, y: 12, size: 0.7, delay: 3.2 },
]
const sparksPerBurst = 14

type Piece = { x: number; delay: number; duration: number; drift: number; spin: number; colour: string; wide: boolean }

function makeConfetti(count: number, seed = 23): Piece[] {
  const next = seededRandom(seed)
  return Array.from({ length: count }, () => ({ x: next() * 100, delay: -next() * 9, duration: 6 + next() * 5, drift: (next() - 0.5) * 60, spin: 360 + next() * 540, colour: colours[Math.floor(next() * colours.length)], wide: next() > 0.5 }))
}
const confetti = makeConfetti(40)

/**
 * The resident portal's festival mode, on a public holiday (from the holiday calendar): fireworks
 * bursting and confetti drifting down over the sky behind the greeting, plus a "Happy <festival>!" line
 * under it. The decoration is aria-hidden and CSS-only (App.css, .festival-sky); the greeting line is
 * real text, so screen readers hear it. With reduced motion the decoration holds still.
 */
export function FestivalCelebration() {
  return (
    <div className="festival-sky" aria-hidden="true">
      {bursts.map((burst, index) => (
        <span key={index} className="festival-burst" style={{ left: `${burst.x}%`, top: `${burst.y}%`, '--burst-size': burst.size, animationDelay: `${burst.delay}s` } as CSSProperties}>
          {Array.from({ length: sparksPerBurst }, (_, spark) => <i key={spark} style={{ '--spark-angle': `${(360 / sparksPerBurst) * spark}deg`, '--spark-colour': colours[(index + spark) % colours.length], animationDelay: `${burst.delay}s` } as CSSProperties} />)}
        </span>
      ))}
      {confetti.map((piece, index) => <span key={`c${index}`} className={`festival-confetti${piece.wide ? ' is-wide' : ''}`} style={{ left: `${piece.x}%`, background: piece.colour, '--confetti-drift': `${piece.drift}px`, '--confetti-spin': `${piece.spin}deg`, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s` } as CSSProperties} />)}
    </div>
  )
}

/** "Happy Dussehra!" under the greeting on a festival day. */
export function FestivalGreeting({ festival }: { festival: string }) {
  return <p className="festival-greeting"><PartyPopper size={16} /> Happy {festival}!</p>
}
