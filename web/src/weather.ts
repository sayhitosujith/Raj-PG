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

// 204 means there is nothing to show (no city set, weather off, or the lookup failed).
async function fetchWeather() {
  const response = await fetch('/api/resident-portal/weather')
  return response.status === 200 ? await response.json() as Weather : null
}

/**
 * The property city's current weather, loaded once and again on each portal refresh; null while
 * loading or when there is none. One request feeds both the weather line and the sky.
 */
export function useWeather(refreshSignal: number) {
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    let isCurrent = true
    fetchWeather().then((next) => { if (isCurrent) setWeather(next) }, () => undefined)
    return () => { isCurrent = false }
  }, [])
  useRefreshSignal(refreshSignal, () => { fetchWeather().then(setWeather, () => undefined) })
  return weather
}
