/**
 * Current weather for a property's city from Open-Meteo, which needs no API key: the city is
 * geocoded once (Open-Meteo geocoding), then the current conditions are read for its coordinates.
 * Called only from the server, so residents' browsers never contact a third party.
 * Licence: Open-Meteo's free API is for non-commercial use; commercial use needs their paid plan
 * (same API, with a key). https://open-meteo.com/en/docs
 */
const geocodingUrl = 'https://geocoding-api.open-meteo.com/v1/search'
const forecastUrl = 'https://api.open-meteo.com/v1/forecast'
const requestTimeoutMs = 5000
// Every resident of a PG shares its city, so caching per city keeps a busy portal to a few calls
// an hour; a failed lookup is retried sooner. A city's coordinates do not change, so they are kept longer.
const weatherCacheMs = 15 * 60_000
const failureCacheMs = 60_000
const placeCacheMs = 24 * 60 * 60_000

/** Coarse sky condition, enough to pick an icon and the portal sky's mood. */
export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'storm' | 'snow' | 'mist'

/** What the resident portal shows: the city as the owner typed it, whole degrees Celsius. */
export type Weather = { city: string; temperature: number; description: string; condition: WeatherCondition; isDay: boolean }

type Place = { latitude: number; longitude: number }
type GeocodingResult = Place & { feature_code?: string; population?: number }

const placeCache = new Map<string, { expiresAt: number; place: Place | null }>()
const weatherCache = new Map<string, { expiresAt: number; weather: Weather | null }>()

/** Weather needs no key, so it is always on; kept for the start-up report. */
export const isWeatherEnabled = () => true

// WMO weather interpretation codes, as Open-Meteo reports them (see its docs, "WMO Weather interpretation codes").
function describeCode(code: number): { condition: WeatherCondition; description: string } {
  if (code === 0) return { condition: 'clear', description: 'clear sky' }
  if (code === 1) return { condition: 'clear', description: 'mainly clear' }
  if (code === 2) return { condition: 'clouds', description: 'partly cloudy' }
  if (code === 3) return { condition: 'clouds', description: 'overcast' }
  if (code === 45 || code === 48) return { condition: 'mist', description: 'fog' }
  if (code >= 51 && code <= 57) return { condition: 'rain', description: 'drizzle' }
  if (code >= 61 && code <= 67) return { condition: 'rain', description: 'rain' }
  if (code >= 71 && code <= 77) return { condition: 'snow', description: 'snow' }
  if (code >= 80 && code <= 82) return { condition: 'rain', description: 'rain showers' }
  if (code === 85 || code === 86) return { condition: 'snow', description: 'snow showers' }
  if (code >= 95) return { condition: 'storm', description: 'thunderstorm' }
  return { condition: 'clouds', description: '' }
}

async function getJson<T>(url: URL): Promise<T | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) })
  if (response.ok) return await response.json() as T
  console.warn(`[weather] ${url.hostname} answered HTTP ${response.status}`)
  return null
}

/**
 * The city's coordinates, looked up in India where every property is. Older English spellings
 * ("Mangalore") often match only small places or airports, so populated places are preferred and
 * then the most populous; official names ("Mangaluru") match the city itself.
 */
async function findPlace(city: string): Promise<Place | null> {
  const cacheKey = city.toLowerCase()
  const cached = placeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.place
  const url = new URL(geocodingUrl)
  url.searchParams.set('name', city)
  url.searchParams.set('count', '10')
  url.searchParams.set('language', 'en')
  url.searchParams.set('countryCode', 'IN')
  const body = await getJson<{ results?: GeocodingResult[] }>(url)
  if (!body) return null
  const rank = (result: GeocodingResult) => [result.feature_code?.startsWith('PPL') ? 1 : 0, result.population ?? 0]
  const best = (body.results ?? []).reduce<GeocodingResult | null>((current, candidate) => {
    if (!current) return candidate
    const [a, b] = [rank(candidate), rank(current)]
    return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) ? candidate : current
  }, null)
  if (!best) console.warn(`[weather] No place found for "${city}"; try its official name (e.g. Mangaluru, Bengaluru).`)
  const place = best ? { latitude: best.latitude, longitude: best.longitude } : null
  placeCache.set(cacheKey, { expiresAt: Date.now() + (place ? placeCacheMs : failureCacheMs), place })
  return place
}

/**
 * The current weather in `city`, or null when the city is unknown or a lookup fails; a weather
 * outage must never break the portal.
 */
export async function currentWeather(city: string): Promise<Weather | null> {
  const name = city.trim()
  const cacheKey = name.toLowerCase()
  const cached = weatherCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.weather
  let weather: Weather | null = null
  try {
    const place = await findPlace(name)
    if (place) {
      const url = new URL(forecastUrl)
      url.searchParams.set('latitude', String(place.latitude))
      url.searchParams.set('longitude', String(place.longitude))
      url.searchParams.set('current', 'temperature_2m,weather_code,is_day')
      const body = await getJson<{ current?: { temperature_2m: number; weather_code: number; is_day: number } }>(url)
      if (body?.current) weather = { city: name, temperature: Math.round(body.current.temperature_2m), ...describeCode(body.current.weather_code), isDay: body.current.is_day === 1 }
    }
  } catch (error) {
    console.warn(`[weather] Lookup for "${name}" failed:`, error instanceof Error ? error.message : error)
  }
  weatherCache.set(cacheKey, { expiresAt: Date.now() + (weather ? weatherCacheMs : failureCacheMs), weather })
  return weather
}
