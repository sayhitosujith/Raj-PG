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

// Weather results, cached per place for a while (failures more briefly) so a busy portal makes few calls.
async function cachedWeather(cacheKey: string, load: () => Promise<Weather | null>) {
  const cached = weatherCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.weather
  let weather: Weather | null = null
  try {
    weather = await load()
  } catch (error) {
    console.warn(`[weather] Lookup for ${cacheKey} failed:`, error instanceof Error ? error.message : error)
  }
  weatherCache.set(cacheKey, { expiresAt: Date.now() + (weather ? weatherCacheMs : failureCacheMs), weather })
  return weather
}

/**
 * The weather code is a model's label and often says drizzle, rain or thunderstorm while the same
 * model has no precipitation falling, which made the portal sky rain under a dry sky. Rain is shown
 * only when precipitation is actually reported (mm over the last 15 minutes); otherwise it reads as cloud.
 */
function confirmRain(described: { condition: WeatherCondition; description: string }, precipitation: number | undefined) {
  const isWet = described.condition === 'rain' || described.condition === 'storm'
  return isWet && !(precipitation && precipitation > 0) ? { condition: 'clouds' as const, description: 'cloudy' } : described
}

async function readWeather(place: Place, name: string): Promise<Weather | null> {
  const url = new URL(forecastUrl)
  url.searchParams.set('latitude', String(place.latitude))
  url.searchParams.set('longitude', String(place.longitude))
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day,precipitation')
  const body = await getJson<{ current?: { temperature_2m: number; weather_code: number; is_day: number; precipitation?: number } }>(url)
  return body?.current ? { city: name, temperature: Math.round(body.current.temperature_2m), ...confirmRain(describeCode(body.current.weather_code), body.current.precipitation), isDay: body.current.is_day === 1 } : null
}

/**
 * The current weather in `city` (a property's City, e.g. "Bengaluru" or "Mahadevapura"), or null
 * when it is unknown or a lookup fails; a weather outage must never break the portal.
 */
export async function currentWeather(city: string): Promise<Weather | null> {
  const name = city.trim()
  return cachedWeather(`city "${name.toLowerCase()}"`, async () => {
    const place = await findPlace(name)
    return place ? readWeather(place, name) : null
  })
}

// Reverse geocoding (coordinates -> area name) from OpenStreetMap's Nominatim. Its usage policy
// asks for an identifying User-Agent, at most one request a second and cached results, which the
// per-area cache below keeps far inside. https://operations.osmfoundation.org/policies/nominatim/
const reverseGeocodingUrl = 'https://nominatim.openstreetmap.org/reverse'
const userAgent = 'raj-pg/1.0 (resident portal weather)'
const areaNameCache = new Map<string, { expiresAt: number; name: string | null }>()

type ReverseGeocodingResult = { address?: Partial<Record<'road' | 'quarter' | 'suburb' | 'neighbourhood' | 'city_district' | 'city' | 'town' | 'village' | 'county', string>> }

async function findAreaName(place: Place, cacheKey: string): Promise<string | null> {
  const cached = areaNameCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.name
  const url = new URL(reverseGeocodingUrl)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(place.latitude))
  url.searchParams.set('lon', String(place.longitude))
  // 18 is street level, so the nearest named neighbourhood comes back rather than the wider suburb.
  url.searchParams.set('zoom', '18')
  url.searchParams.set('accept-language', 'en')
  let name: string | null = null
  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(requestTimeoutMs) })
    if (response.ok) {
      const { address = {} } = await response.json() as ReverseGeocodingResult
      // "Area, City" (e.g. "Medahalli, Bengaluru"): the most local name people recognise, with the
      // city so it reads clearly; just one of them when the other is missing or the same.
      const area = address.neighbourhood ?? address.quarter ?? address.suburb ?? address.village ?? address.city_district ?? address.road ?? null
      const city = address.city ?? address.town ?? address.county ?? null
      name = area && city && area !== city ? `${area}, ${city}` : area ?? city

    } else {
      console.warn(`[weather] ${url.hostname} answered HTTP ${response.status}`)
    }
  } catch (error) {
    console.warn('[weather] Area name lookup failed:', error instanceof Error ? error.message : error)
  }
  areaNameCache.set(cacheKey, { expiresAt: Date.now() + (name ? placeCacheMs : failureCacheMs), name })
  return name
}

/**
 * Coordinates rounded to `decimals` places: two (about 1 km) is plenty for weather and lets nearby
 * residents share the cache; four (about 11 m) names the exact neighbourhood.
 */
export function roundCoordinates(latitude: number, longitude: number, decimals = 2): Place {
  const factor = 10 ** decimals
  return { latitude: Math.round(latitude * factor) / factor, longitude: Math.round(longitude * factor) / factor }
}

/**
 * The current weather where the viewer is, named after their neighbourhood ("Medahalli, Bengaluru"),
 * or null when a lookup fails. The name comes from the position to about 11 m; the weather from it
 * rounded to about 1 km, since conditions do not change street by street.
 */
export async function weatherNear(latitude: number, longitude: number): Promise<Weather | null> {
  const spot = roundCoordinates(latitude, longitude, 4)
  const spotKey = `${spot.latitude},${spot.longitude}`
  const area = await findAreaName(spot, spotKey)
  const place = roundCoordinates(latitude, longitude)
  const weather = await cachedWeather(`location ${place.latitude},${place.longitude}`, () => readWeather(place, 'Your location'))
  return weather && { ...weather, city: area ?? weather.city }
}
