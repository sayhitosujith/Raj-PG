import { useCallback, useEffect, useState } from 'react'
import { useRefreshSignal } from './useAutoRefresh'

/** Coarse sky condition from the server, enough to pick an icon and the portal sky's mood. */
export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'storm' | 'snow' | 'mist'

/** Current weather in the resident's property city, as the portal API returns it. */
export type Weather = { city: string; temperature: number; description: string; condition: WeatherCondition; isDay: boolean; /** Set here, not by the server: true when it is for the device's position rather than the property city. */ isCurrentLocation?: boolean; /** Metres; only for the device's position. */ accuracyM?: number }

/** Whether the sky should show rain (and lightning). */
export const isRainy = (condition: WeatherCondition | undefined) => condition === 'rain' || condition === 'storm'

/**
 * Development only: `?sky=rain` or `?sky=storm` on the portal URL previews the rainy sky without
 * waiting for real rain. Production builds drop it, since `import.meta.env.DEV` is false there.
 */
export function previewSkyCondition(): WeatherCondition | undefined {
  if (!import.meta.env.DEV) return undefined
  const value = new URLSearchParams(window.location.search).get('sky')
  return value === 'rain' || value === 'storm' ? value : undefined
}

type Coordinates = { latitude: number; longitude: number; /** Metres, as the device reports it. */ accuracy: number }

// GPS fixes improve over the first few seconds, so the portal keeps listening until one is within
// 10 m, then stops; after `gpsWaitMs` it settles for the best fix so far (indoors that may be 20–50 m).
const targetAccuracyM = 10
const gpsWaitMs = 15_000
// The portal refreshes every few seconds; reusing a recent fix keeps GPS from running (and draining a
// phone battery) each time. A resident who walks across town is picked up within five minutes.
const fixReuseMs = 5 * 60_000
let lastFix: { position: Coordinates; at: number } | null = null

/**
 * The device's exact position (high-accuracy GPS, 5 decimals ≈ 1 m), or null when the browser has
 * no geolocation or the resident declines. The browser asks for permission once and remembers it.
 */
function findPosition(): Promise<Coordinates | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  if (lastFix && Date.now() - lastFix.at < fixReuseMs) return Promise.resolve(lastFix.position)
  return new Promise((resolve) => {
    let best: GeolocationCoordinates | null = null
    const finish = () => {
      navigator.geolocation.clearWatch(watchId)
      window.clearTimeout(timer)
      const position = best && { latitude: Math.round(best.latitude * 1e5) / 1e5, longitude: Math.round(best.longitude * 1e5) / 1e5, accuracy: Math.round(best.accuracy) }
      if (position) lastFix = { position, at: Date.now() }
      resolve(position)
    }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!best || coords.accuracy < best.accuracy) best = coords
        if (coords.accuracy <= targetAccuracyM) finish()
      },
      // Declined or unavailable: stop now; a timeout here just means "no better fix yet".
      (error) => { if (error.code !== error.TIMEOUT) finish() },
      { enableHighAccuracy: true, timeout: gpsWaitMs, maximumAge: 30_000 },
    )
    const timer = window.setTimeout(finish, gpsWaitMs)
  })
}

// Without a position the server uses the property's city. 204 means there is nothing to show.
async function fetchWeather(position: Coordinates | null) {
  const response = await fetch(`/api/resident-portal/weather${position ? `?lat=${position.latitude}&lon=${position.longitude}` : ''}`)
  return response.status === 200 ? { ...await response.json() as Weather, isCurrentLocation: Boolean(position), accuracyM: position?.accuracy } : null
}

/** What a tap on the weather got: the device's weather, a refusal of permission, or no position (off, timed out, no signal). */
export type LocateResult = 'located' | 'denied' | 'unavailable'

/**
 * One position, asked for from a tap. Normal accuracy: a Wi-Fi or cell fix is quick and plenty for
 * the weather, where waiting on GPS indoors can time out. Says whether the browser actually refused,
 * since only an actual refusal is "blocked"; the permission state browsers report (an earlier version
 * checked it first) can say denied on an iPhone with location switched on, so it is not consulted.
 */
function requestPosition(): Promise<{ position: Coordinates | null; denied: boolean }> {
  if (!('geolocation' in navigator)) return Promise.resolve({ position: null, denied: false })
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { latitude: Math.round(coords.latitude * 1e5) / 1e5, longitude: Math.round(coords.longitude * 1e5) / 1e5, accuracy: Math.round(coords.accuracy) }
        lastFix = { position, at: Date.now() }
        resolve({ position, denied: false })
      },
      (error) => resolve({ position: null, denied: error.code === error.PERMISSION_DENIED }),
      { enableHighAccuracy: false, timeout: gpsWaitMs, maximumAge: 60_000 },
    )
  })
}

/**
 * Current weather where the resident is, when their device shares its location, otherwise in their
 * property's city; null while loading or when there is none. One request feeds both the weather line
 * and the sky. On first load the city's weather shows straight away and is replaced once the
 * resident allows location, since they may take a while to answer the prompt, or never do.
 *
 * The request made on page load is often never shown: browsers quietly block location prompts that
 * no tap asked for, so the resident sees the property's city with no way to change it. `locate` is for
 * a tap, the request browsers do show; it asks afresh rather than reusing an earlier fix, and resolves
 * to what happened (see LocateResult).
 */
export function useWeather(refreshSignal: number) {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  // Once the first lookup (by the property's city) has answered: from then on "no weather" means there
  // is none for the city, not that it is still loading, so the page can offer the device's location.
  const [hasChecked, setHasChecked] = useState(false)
  useEffect(() => {
    let isCurrent = true
    let isLocated = false
    fetchWeather(null).then((next) => { if (isCurrent && !isLocated) setWeather(next) }, () => undefined).finally(() => { if (isCurrent) setHasChecked(true) })
    findPosition().then(async (position) => {
      const near = position ? await fetchWeather(position) : null
      if (near && isCurrent) { isLocated = true; setWeather(near) }
    }).catch(() => undefined)
    return () => { isCurrent = false }
  }, [])
  // By refresh time the resident has answered, so one request with (or without) the position is enough.
  useRefreshSignal(refreshSignal, () => { findPosition().then(fetchWeather).then((next) => { if (next) setWeather(next) }, () => undefined) })
  // Must be called straight from the tap: requestPosition starts the browser's request before the
  // first await, which is what lets the browser treat it as the resident's own request.
  const locate = useCallback(async (): Promise<LocateResult> => {
    setIsLocating(true)
    try {
      const { position, denied } = await requestPosition()
      if (denied) return 'denied'
      const near = position ? await fetchWeather(position) : null
      if (near) setWeather(near)
      return near ? 'located' : 'unavailable'
    } catch {
      return 'unavailable'
    } finally {
      setIsLocating(false)
    }
  }, [])
  return { weather, locate, isLocating, hasChecked }
}

/**
 * A sentence to add to the owner's "saved" notice when residents will not get weather for a
 * property's City, else ''. A misspelt city ("Manglore") hides the weather whenever a resident's phone
 * does not share its location, so it looks intermittent unless the owner is told when they save it.
 * Says nothing when the city is blank or the check itself fails: neither is the owner's mistake.
 */
export async function weatherCityWarning(city: FormDataEntryValue | null): Promise<string> {
  const name = typeof city === 'string' ? city.trim() : ''
  if (!name) return ''
  try {
    const response = await fetch(`/api/weather/city-check?city=${encodeURIComponent(name)}`)
    if (!response.ok) return ''
    const { found } = await response.json() as { found: boolean | null }
    return found === false ? ` Weather won't show for residents: "${name}" wasn't found. Try its official name, e.g. Mangaluru or Bengaluru.` : ''
  } catch {
    return ''
  }
}
