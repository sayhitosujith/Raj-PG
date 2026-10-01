import { useEffect, useState, type CSSProperties } from 'react'
import { cityWindows, skyline, type CityWindow } from './cityBuildings'
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

// Two helicopters crossing left to right at different heights, sizes and speeds, so they never
// fly in step; `rest` is where each hovers when motion is reduced.
const helicopters = [
  { top: '20%', size: 1, duration: 36, delay: -8, rest: '22%' },
  { top: '33%', size: 0.72, duration: 50, delay: -31, rest: '60%' },
]

/** Lit windows in a dark sky, a few slowly flickering. */
function CityLights({ windows }: { windows: CityWindow[] }) {
  return <g className="city-windows">{windows.map((light, index) => <rect key={index} className={light.twinkle ? 'is-twinkling' : undefined} x={light.x} y={light.y} width={4} height={6} style={light.twinkle ? { animationDelay: `${light.delay}s` } : undefined} />)}</g>
}

/** One helicopter silhouette facing right, with spinning rotors and a navigation light. */
function Helicopter() {
  return (
    <svg className="chopper-body" viewBox="0 0 80 34">
      <rect className="chopper-rotor" x="20" y="5.5" width="52" height="1.8" rx="0.9" />
      <rect x="45" y="7" width="2" height="4" />
      <path d="M34 14 Q36 10 46 10 Q58 10 62 16 Q63 22 56 25 L38 25 Q33 23 34 14 Z" />
      <path className="chopper-window" d="M50 12 Q57 12 60 17 L50 17 Z" />
      <path d="M6 13 L34 15 L34 19 L8 18 Z M4 8 L8 8 L10 16 L6 16 Z" />
      <rect className="chopper-tail-rotor" x="2" y="11.4" width="8" height="1.2" rx="0.6" />
      <path className="chopper-skids" d="M38 25 V29 M54 25 V29 M32 29 H61" />
      <circle className="chopper-light" cx="6" cy="19" r="1.3" />
    </svg>
  )
}

/**
 * Decorative sky behind the top of the resident portal, following the viewer's local time: by day a
 * sun in a blue sky, by night a moon with twinkling stars; both over a three-layer city skyline (windows lit after dark), with
 * drifting clouds, a small flock of birds and two helicopters, fading into the page below. When it is raining in
 * the property's city the sky turns overcast instead: no sun, moon, stars, birds or helicopters, darker clouds,
 * falling rain and occasional lightning (more often in a thunderstorm). Drawn inline so it needs no
 * image requests; colours and motion live in App.css (.portal-sky, with .is-day / .is-night / .is-rainy).
 */
export function SkyBackdrop({ condition }: { condition?: WeatherCondition }) {
  const daytime = useDaytime()
  const raining = isRainy(condition)
  // Windows only show as lights when the sky is dark: at night, or under rain clouds.
  const isDark = !daytime || raining
  return (
    <div className={`portal-sky ${daytime ? 'is-day' : 'is-night'}${raining ? ' is-rainy' : ''}`} aria-hidden="true">
      {raining ? null : daytime ? <div className="sky-sun" /> : <>
        {stars.map((star, index) => <span key={index} className="sky-star" style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` } as CSSProperties} />)}
        <div className="sky-moon" />
      </>}
      {clouds.map((cloud, index) => <div key={index} className="sky-cloud" style={{ top: cloud.top, '--cloud-size': cloud.size, '--cloud-duration': `${cloud.duration}s`, '--cloud-delay': `${cloud.delay}s`, '--cloud-rest': cloud.rest } as CSSProperties} />)}
      {raining
        ? <>
            <div className={`sky-lightning${condition === 'storm' ? ' is-storm' : ''}`} />
            <div className="sky-rain">
              {rain.map((drop, index) => <span key={index} className="rain-drop" style={{ left: `${drop.x}%`, '--rain-rest': `${drop.rest}%`, height: drop.length, opacity: drop.opacity, animationDelay: `${drop.delay}s`, animationDuration: `${drop.duration}s` } as CSSProperties} />)}
            </div>
          </>
        : <>
            <div className="sky-flock">
              {birds.map((bird, index) => (
                <svg key={index} className="sky-bird" viewBox="0 0 40 16" style={{ left: bird.x, top: bird.y, width: 30 * bird.size, animationDelay: `${bird.flap}s` }}>
                  <path d="M2 11 Q11 2 20 10 Q29 2 38 11" />
                </svg>
              ))}
            </div>
            {helicopters.map((helicopter, index) => (
              <div key={index} className="sky-chopper" style={{ top: helicopter.top, width: 84 * helicopter.size, '--chopper-duration': `${helicopter.duration}s`, '--chopper-delay': `${helicopter.delay}s`, '--chopper-rest': helicopter.rest } as CSSProperties}>
                <Helicopter />
              </div>
            ))}
          </>}
      {/* Kept in proportion and cropped at the sides on narrow screens; layers are drawn back to front, each
          layer's windows just above it so nearer buildings cover them. Windows light up in the dark. */}
      <svg className="sky-city" viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice">
        <path className="city-far" d={skyline.far} />
        <path className="city-middle" d={skyline.middle} />
        {isDark && <CityLights windows={cityWindows.middle} />}
        <path className="city-near" d={skyline.near} />
        {isDark && <CityLights windows={cityWindows.near} />}
      </svg>
    </div>
  )
}
