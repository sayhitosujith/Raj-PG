import type { CSSProperties } from 'react'

type Star = { x: number; y: number; size: number; delay: number; duration: number }

// A fixed pseudo-random sky (seeded), so the stars sit in the same places on every visit and render.
function makeStars(count: number, seed = 7): Star[] {
  let state = seed
  const next = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646 }
  return Array.from({ length: count }, () => ({ x: next() * 100, y: next() * 58, size: 1 + next() * 2.2, delay: next() * 6, duration: 2.5 + next() * 4 }))
}
const stars = makeStars(70)

// Hand-placed clouds: height in the sky, size, drift time, a head start (negative delay) and where
// each rests when motion is reduced.
const clouds = [
  { top: '9%', size: 1.1, duration: 170, delay: -40, rest: '18%' },
  { top: '19%', size: 0.75, duration: 125, delay: -95, rest: '52%' },
  { top: '31%', size: 1.35, duration: 215, delay: -150, rest: '72%' },
  { top: '14%', size: 0.6, duration: 110, delay: -12, rest: '86%' },
  { top: '40%', size: 0.9, duration: 190, delay: -62, rest: '34%' },
]

/**
 * Decorative night sky behind the top of the resident portal: a moon rising above three mountain
 * ranges, twinkling stars and drifting clouds, all fading into the page below. Drawn inline so it
 * needs no image requests; colours and motion live in App.css (.portal-sky).
 */
export function NightSkyBackdrop() {
  return (
    <div className="portal-sky" aria-hidden="true">
      {stars.map((star, index) => <span key={index} className="sky-star" style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` } as CSSProperties} />)}
      <div className="sky-moon" />
      {clouds.map((cloud, index) => <div key={index} className="sky-cloud" style={{ top: cloud.top, '--cloud-size': cloud.size, '--cloud-duration': `${cloud.duration}s`, '--cloud-delay': `${cloud.delay}s`, '--cloud-rest': cloud.rest } as CSSProperties} />)}
      {/* Kept in proportion and cropped at the sides on narrow screens, so peaks never turn into spikes; ranges are listed back to front so nearer ones overlap. */}
      <svg className="sky-mountains" viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice">
        <path className="mountain-far" d="M0 170 L90 120 L170 150 L270 70 L360 130 L450 95 L560 150 L660 60 L760 125 L860 90 L960 140 L1080 50 L1180 115 L1280 80 L1370 120 L1440 95 L1440 320 L0 320 Z" />
        <path className="mountain-mid" d="M0 215 L110 160 L200 195 L320 120 L430 185 L540 150 L640 200 L760 130 L880 190 L990 150 L1110 200 L1230 115 L1340 170 L1440 140 L1440 320 L0 320 Z" />
        <path className="mountain-near" d="M0 260 L130 205 L250 245 L380 185 L500 240 L620 210 L760 255 L900 195 L1030 245 L1160 205 L1300 250 L1440 215 L1440 320 L0 320 Z" />
      </svg>
    </div>
  )
}
