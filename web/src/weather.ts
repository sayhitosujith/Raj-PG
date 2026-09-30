import { useEffect, useState } from 'react'
import { useRefreshSignal } from './useAutoRefresh'

/** Coarse sky condition from the server, enough to pick an icon and the portal sky's mood. */
export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'storm' | 'snow' | 'mist'

/** Current weather in the resident's property city, as the portal API returns it. */
export type Weather = { city: string; temperature: number; description: string; condition: WeatherCondition; isDay: boolean }

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

type Coordinates = { latitude: number; longitude: number }

/**
 * The device's position rounded to two decimals (about 1 km, plenty for weather), or null when the
 * browser has no geolocation or the resident declines. The browser asks for permission once and
 * remembers the answer; a recent fix is reused, so refreshes do not wait on GPS.
 */
function findPosition(): Promise<Coordinates | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: Math.round(coords.latitude * 100) / 100, longitude: Math.round(coords.longitude * 100) / 100 }),
    () => resolve(null),
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
  ))
}

// Without a position the server uses the property's city. 204 means there is nothing to show.
async function fetchWeather(position: Coordinates | null) {
  const response = await fetch(`/api/resident-portal/weather${position ? `?lat=${position.latitude}&lon=${position.longitude}` : ''}`)
  return response.status === 200 ? await response.json() as Weather : null
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
