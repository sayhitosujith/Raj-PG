/**
 * Current weather for a property's city from Open-Meteo, which needs no API key: the city is
 * geocoded once (Open-Meteo geocoding), then the current conditions are read for its coordinates.
 * Called only from the server, so residents' browsers never contact a third party.
 * Licence: Open-Meteo's free API is for non-commercial use; commercial use needs their paid plan
 * (same API, with a key). https://open-meteo.com/en/docs
 */
const geocodingUrl = 'https://geocoding-api.open-meteo.com/v1/search'
const forecastUrl = 'https://api.open-meteo.com/v1/forecast'
// Backups, used only when Open-Meteo does not answer: OpenStreetMap search for a city, MET Norway for the weather.
const searchGeocodingUrl = 'https://nominatim.openstreetmap.org/search'
const metForecastUrl = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
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

// Every request to a weather or map service names the app and where to reach it: MET Norway refuses
// requests without one, and OpenStreetMap's Nominatim asks for it in its usage policy.
const userAgent = 'raj-pg/1.0 (+https://raj-pg.netlify.app; resident portal weather)'

async function getJson<T>(url: URL, headers: Record<string, string> = {}): Promise<T | null> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(requestTimeoutMs) })
  if (response.ok) return await response.json() as T
  console.warn(`[weather] ${url.hostname} answered HTTP ${response.status}`)
  return null
}

/** getJson that reports a timeout or a dropped connection as "no answer" (null), like an error status. */
async function tryGetJson<T>(url: URL, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    return await getJson<T>(url, headers)
  } catch (error) {
    console.warn(`[weather] ${url.hostname} did not answer:`, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Open-Meteo's geocoding: the place, null when it has no match, or undefined when it could not be
 * asked. Older English spellings ("Mangalore") often match only small places or airports, so
 * populated places are preferred and then the most populous; official names ("Mangaluru") match the city.
 */
async function geocodeOpenMeteo(city: string): Promise<Place | null | undefined> {
  const url = new URL(geocodingUrl)
  url.searchParams.set('name', city)
  url.searchParams.set('count', '10')
  url.searchParams.set('language', 'en')
  url.searchParams.set('countryCode', 'IN')
  const body = await tryGetJson<{ results?: GeocodingResult[] }>(url)
  if (!body) return undefined
  const rank = (result: GeocodingResult) => [result.feature_code?.startsWith('PPL') ? 1 : 0, result.population ?? 0]
  const best = (body.results ?? []).reduce<GeocodingResult | null>((current, candidate) => {
    if (!current) return candidate
    const [a, b] = [rank(candidate), rank(current)]
    return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) ? candidate : current
  }, null)
  return best ? { latitude: best.latitude, longitude: best.longitude } : null
}

/**
 * OpenStreetMap's search, the backup: the place, null when it has no match, or undefined when it
 * could not be asked. It also matches some spellings Open-Meteo does not.
 */
async function geocodeNominatim(city: string): Promise<Place | null | undefined> {
  const url = new URL(searchGeocodingUrl)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', city)
  url.searchParams.set('countrycodes', 'in')
  url.searchParams.set('limit', '1')
  url.searchParams.set('accept-language', 'en')
  const body = await tryGetJson<Array<{ lat: string; lon: string }>>(url, { 'User-Agent': userAgent })
  if (!body) return undefined
  return body[0] ? { latitude: Number(body[0].lat), longitude: Number(body[0].lon) } : null
}

/**
 * The city's coordinates, looked up in India where every property is: Open-Meteo first, then
 * OpenStreetMap when Open-Meteo cannot be asked or has no match. Open-Meteo throttles busy shared
 * addresses such as a free Render server's, which left production with no weather at all.
 * Undefined when neither could be asked: an outage, not a misspelling, so it is not cached as one.
 */
async function findPlace(city: string): Promise<Place | null | undefined> {
  const cacheKey = city.toLowerCase()
  const cached = placeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.place
  const primary = await geocodeOpenMeteo(city)
  const place = primary ?? await geocodeNominatim(city)
  if (place === undefined && primary === undefined) return undefined
  if (!place) console.warn(`[weather] No place found for "${city}"; try its official name (e.g. Mangaluru, Bengaluru).`)
  placeCache.set(cacheKey, { expiresAt: Date.now() + (place ? placeCacheMs : failureCacheMs), place: place ?? null })
  return place ?? null
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

async function readOpenMeteo(place: Place, name: string): Promise<Weather | null> {
  const url = new URL(forecastUrl)
  url.searchParams.set('latitude', String(place.latitude))
  url.searchParams.set('longitude', String(place.longitude))
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day,precipitation')
  const body = await tryGetJson<{ current?: { temperature_2m: number; weather_code: number; is_day: number; precipitation?: number } }>(url)
  return body?.current ? { city: name, temperature: Math.round(body.current.temperature_2m), ...confirmRain(describeCode(body.current.weather_code), body.current.precipitation), isDay: body.current.is_day === 1 } : null
}

/** A MET Norway symbol ("partlycloudy_day", "lightrainshowers_night", "cloudy") as the portal's condition. */
function describeSymbol(symbol: string): { condition: WeatherCondition; description: string } {
  const base = symbol.replace(/_(day|night|polartwilight)$/, '')
  if (base.includes('thunder')) return { condition: 'storm', description: 'thunderstorm' }
  if (base.includes('snow') || base.includes('sleet')) return { condition: 'snow', description: base.includes('sleet') ? 'sleet' : 'snow' }
  if (base.includes('rain')) return { condition: 'rain', description: base.includes('showers') ? 'rain showers' : base.startsWith('light') ? 'light rain' : 'rain' }
  if (base === 'fog') return { condition: 'mist', description: 'fog' }
  if (base === 'clearsky') return { condition: 'clear', description: 'clear sky' }
  if (base === 'fair') return { condition: 'clear', description: 'mainly clear' }
  if (base === 'partlycloudy') return { condition: 'clouds', description: 'partly cloudy' }
  return { condition: 'clouds', description: 'overcast' }
}

/**
 * Day or night for a MET Norway reading: from the symbol when it says (most do), otherwise from the
 * sun's rough position, the reading's UTC hour shifted by the longitude (15 degrees an hour).
 */
function isDayFor(symbol: string, place: Place, timeIso: string) {
  if (symbol.endsWith('_day')) return true
  if (symbol.endsWith('_night') || symbol.endsWith('_polartwilight')) return false
  const solarHour = (new Date(timeIso).getUTCHours() + place.longitude / 15 + 24) % 24
  return solarHour >= 6 && solarHour < 18
}

/**
 * MET Norway (the Norwegian Meteorological Institute), the backup when Open-Meteo does not answer.
 * Free and keyless, global, and asks only for an identifying User-Agent and coordinates to at most
 * four decimals. https://api.met.no/doc/TermsOfService (data under CC BY 4.0).
 */
async function readMetNorway(place: Place, name: string): Promise<Weather | null> {
  const url = new URL(metForecastUrl)
  url.searchParams.set('lat', place.latitude.toFixed(4))
  url.searchParams.set('lon', place.longitude.toFixed(4))
  type Reading = { time: string; data: { instant: { details: { air_temperature: number } }; next_1_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } }; next_6_hours?: { summary: { symbol_code: string } } } }
  const body = await tryGetJson<{ properties?: { timeseries?: Reading[] } }>(url, { 'User-Agent': userAgent })
  const now = body?.properties?.timeseries?.[0]
  if (!now) return null
  const symbol = now.data.next_1_hours?.summary.symbol_code ?? now.data.next_6_hours?.summary.symbol_code ?? 'cloudy'
  return { city: name, temperature: Math.round(now.data.instant.details.air_temperature), ...confirmRain(describeSymbol(symbol), now.data.next_1_hours?.details?.precipitation_amount), isDay: isDayFor(symbol, place, now.time) }
}

/** Open-Meteo first; MET Norway when it does not answer (throttled, down, or timed out). */
async function readWeather(place: Place, name: string): Promise<Weather | null> {
  return await readOpenMeteo(place, name) ?? await readMetNorway(place, name)
}

/**
 * Whether a property's City can be found for the weather: true or false, or null when the lookup
 * itself failed (a timeout or an outage says nothing about the spelling). Uses the same lookup as
 * currentWeather, so the answer matches what residents will see. A misspelt city ("Manglore") hides
 * the weather whenever a resident's phone does not share its location, which looks intermittent.
 */
export async function isWeatherCity(city: string): Promise<boolean | null> {
  const place = await findPlace(city.trim())
  return place === undefined ? null : Boolean(place)
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
