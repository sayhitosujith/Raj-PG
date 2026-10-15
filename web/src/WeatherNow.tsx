import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Snowflake, Sun, type LucideIcon } from 'lucide-react'
import type { LocateResult, Weather, WeatherCondition } from './weather'

const conditionIcons: Record<WeatherCondition, LucideIcon> = { clear: Sun, clouds: Cloud, rain: CloudRain, storm: CloudLightning, snow: Snowflake, mist: CloudFog }

/**
 * The weather as a small chip for the portal's top bar: icon and temperature, with the place beside it
 * on wider screens. The place reads "(your location)" when the device shares its position, else it is
 * the property's city. Renders nothing when there is no weather, so an outage leaves no gap.
 */
export function WeatherChip({ weather }: { weather: Weather | null }) {
  if (!weather) return null
  // A clear night shows the moon rather than the sun.
  const Icon = weather.condition === 'clear' && !weather.isDay ? Moon : conditionIcons[weather.condition]
  const place = weather.isCurrentLocation ? `${weather.city} (your location)` : weather.city
  const details = [place, weather.description, weather.accuracyM !== undefined ? `Location accurate to about ${weather.accuracyM} m` : ''].filter(Boolean).join(' · ')
  return <span className="weather-chip" title={details} aria-label={`Weather in ${place}: ${weather.temperature}°C`}><Icon size={15} aria-hidden="true" /><span className="weather-chip-city">{weather.city}</span><strong>{weather.temperature}°C</strong></span>
}

/**
 * The greeting's weather: the chip with the place under it. Until the weather follows the device it
 * is a button, because the location request a page makes on load is often silently blocked: a tap
 * asks again in the way browsers do show, or, when this site is blocked, says how to allow it.
 *
 * With no weather at all (the property's city cannot be found and no location yet) it is still a
 * button once the first lookup has answered, a plain "Weather" chip. Rendering nothing there left the
 * resident with nothing to tap, so the weather could never appear.
 */
export function GreetingWeather({ weather, isLocating, hasChecked, onLocate, onNotice }: { weather: Weather | null; isLocating: boolean; hasChecked: boolean; onLocate: () => Promise<LocateResult>; onNotice: (message: string) => void }) {
  if (weather?.isCurrentLocation) return <div className="welcome-weather"><WeatherChip weather={weather} /><span className="welcome-weather-city" title={weather.city}>{weather.city}</span></div>
  if (!weather && (!hasChecked || !('geolocation' in navigator))) return null
  // Not an async function: onLocate has to start within the tap itself for the browser to show its prompt.
  const ask = () => {
    void onLocate().then((result) => {
      if (result === 'denied') onNotice('Location is blocked for this site. Allow it in your browser’s site settings, then tap the weather again.')
      else if (result === 'unavailable') onNotice(weather ? 'Could not get your location, so this is the weather for your property.' : 'Could not get your location. Check that location is turned on, then tap again.')
      else if (result === 'no-weather') onNotice('Got your location, but the weather service did not answer. Try again in a minute.')
    })
  }
  return (
    <button type="button" className="welcome-weather is-locatable" onClick={ask} disabled={isLocating} aria-label={weather ? `Weather in ${weather.city}: ${weather.temperature}°C. Tap to use your location instead.` : 'Show the weather for your location'}>
      {weather ? <><WeatherChip weather={weather} /><span className="welcome-weather-city" title={weather.city}>{weather.city}</span></> : <span className="weather-chip"><CloudSun size={15} aria-hidden="true" /><strong>Weather</strong></span>}
      <span className="welcome-weather-hint">{isLocating ? 'Finding you…' : 'Tap for your location'}</span>
    </button>
  )
}
