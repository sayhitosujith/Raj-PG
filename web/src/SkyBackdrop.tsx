import { useEffect, useState, type CSSProperties } from 'react'
import { isRainy, type WeatherCondition } from './weather'

// Day runs 6 am to 6 pm on the viewer's own clock (the device's local time zone).
const DAY_STARTS_AT = 6
const NIGHT_STARTS_AT = 18
const isDaytime = (now: Date) => now.getHours() >= DAY_STARTS_AT && now.getHours() < NIGHT_STARTS_AT

/** Day or night on the viewer's clock, re-checked every minute so an open tab turns over at dawn and dusk. */
function useDaytime() {
  const [daytime, setDaytime] = useState(() => isDaytime(new Date()))
  useEffect(() => {
    const timer = window.setInterval(() => setDaytime(isDaytime(new Date())), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return daytime
}

type Star = { x: number; y: number; size: number; delay: number; duration: number }
type RainDrop = { x: number; rest: number; length: number; delay: number; duration: number; opacity: number }

// A seeded pseudo-random sequence, so stars and raindrops sit in the same places on every visit and render.
function seededRandom(seed: number) {
  let state = seed
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646 }
}

function makeStars(count: number, seed = 7): Star[] {
  const next = seededRandom(seed)
  return Array.from({ length: count }, () => ({ x: next() * 100, y: next() * 58, size: 1 + next() * 2.2, delay: next() * 6, duration: 2.5 + next() * 4 }))
}
const stars = makeStars(70)

// Drops start a little past the right edge because they fall slanting left; `rest` places each
// streak when motion is reduced and the rain is drawn still.
function makeRain(count: number, seed = 11): RainDrop[] {
  const next = seededRandom(seed)
  return Array.from({ length: count }, () => ({ x: next() * 115, rest: next() * 90, length: 14 + next() * 12, delay: -next() * 1.2, duration: 0.55 + next() * 0.45, opacity: 0.35 + next() * 0.45 }))
}
const rain = makeRain(110)

// Hand-placed clouds: height in the sky, size, drift time, a head start (negative delay) and where
// each rests when motion is reduced.
const clouds = [
  { top: '9%', size: 1.1, duration: 170, delay: -40, rest: '18%' },
  { top: '19%', size: 0.75, duration: 125, delay: -95, rest: '52%' },
  { top: '31%', size: 1.35, duration: 215, delay: -150, rest: '72%' },
  { top: '14%', size: 0.6, duration: 110, delay: -12, rest: '86%' },
  { top: '40%', size: 0.9, duration: 190, delay: -62, rest: '34%' },
]

// A loose V of four birds: offset from the lead bird (px), size, and a flap phase so the wings
// don't beat in unison.
const birds = [
  { x: 0, y: 0, size: 1, flap: 0 },
  { x: -30, y: 8, size: 0.85, flap: -0.25 },
  { x: -28, y: -7, size: 0.8, flap: -0.5 },
  { x: -58, y: 14, size: 0.7, flap: -0.15 },
]

/**
 * Decorative sky behind the top of the resident portal, following the viewer's local time: by day a
 * sun in a blue sky, by night a moon with twinkling stars; both with
 * drifting clouds and a small flock of birds, fading into the page below. When it is raining in
 * the property's city the sky turns overcast instead: no sun, moon, stars or birds, darker clouds,
 * falling rain and occasional lightning (more often in a thunderstorm). Drawn inline so it needs no
 * image requests; colours and motion live in App.css (.portal-sky, with .is-day / .is-night / .is-rainy).
 */
export function SkyBackdrop({ condition }: { condition?: WeatherCondition }) {
  const daytime = useDaytime()
  const raining = isRainy(condition)
  return (
    <div className={`portal-sky ${daytime ? 'is-day' : 'is-night'}${raining ? ' is-rainy' : ''}`} aria-hidden="true">
      {raining ? null : daytime ? <div className="sky-sun" /> : <>
        {stars.map((star, index) => <span key={index} className="sky-star" style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` } as CSSProperties} />)}
        <div className="sky-moon" />
      </>}
      {clouds.map((cloud, index) => <div key={index} className="sky-cloud" style={{ top: cloud.top, '--cloud-size': cloud.size, '--cloud-duration': `${cloud.duration}s`, '--cloud-delay': `${cloud.delay}s`, '--cloud-rest': cloud.rest } as CSSProperties} />)}
      {raining
        ? <>
            <div className={`sky-lightning${condition === 'storm' ? ' is-storm' : ''}`}>
              {/* A forked bolt under the glow, so a flash reads as lightning rather than the sky just brightening. */}
              <svg className="sky-bolt" viewBox="0 0 40 120"><path d="M24 0 L10 52 H21 L8 120 L34 40 H22 L32 0 Z" /></svg>
            </div>
            <div className="sky-rain">
              {rain.map((drop, index) => <span key={index} className="rain-drop" style={{ left: `${drop.x}%`, '--rain-rest': `${drop.rest}%`, height: drop.length, opacity: drop.opacity, animationDelay: `${drop.delay}s`, animationDuration: `${drop.duration}s` } as CSSProperties} />)}
            </div>
          </>
        : <div className="sky-flock">
            {birds.map((bird, index) => (
              <svg key={index} className="sky-bird" viewBox="0 0 40 16" style={{ left: bird.x, top: bird.y, width: 30 * bird.size, animationDelay: `${bird.flap}s` }}>
                <path d="M2 11 Q11 2 20 10 Q29 2 38 11" />
              </svg>
            ))}
          </div>}
    </div>
  )
}
