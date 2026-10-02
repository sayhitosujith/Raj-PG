import { useEffect, useState } from 'react'
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
// The portal refreshes every minute; reusing a recent fix keeps GPS from running (and draining a
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

/**
 * Current weather where the resident is, when their device shares its location, otherwise in their
 * property's city; null while loading or when there is none. One request feeds both the weather line
 * and the sky. On first load the city's weather shows straight away and is replaced once the
 * resident allows location, since they may take a while to answer the prompt, or never do.
 */
export function useWeather(refreshSignal: number) {
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    let isCurrent = true
    let isLocated = false
    fetchWeather(null).then((next) => { if (isCurrent && !isLocated) setWeather(next) }, () => undefined)
    findPosition().then(async (position) => {
      const near = position ? await fetchWeather(position) : null
      if (near && isCurrent) { isLocated = true; setWeather(near) }
    }).catch(() => undefined)
    return () => { isCurrent = false }
  }, [])
  // By refresh time the resident has answered, so one request with (or without) the position is enough.
  useRefreshSignal(refreshSignal, () => { findPosition().then(fetchWeather).then((next) => { if (next) setWeather(next) }, () => undefined) })
  return weather
}
