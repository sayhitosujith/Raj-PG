import { Cloud, CloudFog, CloudLightning, CloudRain, Moon, Snowflake, Sun, type LucideIcon } from 'lucide-react'
import type { LocationAccess, Weather, WeatherCondition } from './weather'

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
 */
export function GreetingWeather({ weather, access, isLocating, onLocate, onNotice }: { weather: Weather | null; access: LocationAccess; isLocating: boolean; onLocate: () => Promise<boolean>; onNotice: (message: string) => void }) {
  if (!weather) return null
  const city = <span className="welcome-weather-city" title={weather.city}>{weather.city}</span>
  if (weather.isCurrentLocation) return <div className="welcome-weather"><WeatherChip weather={weather} />{city}</div>
  // Not an async function: onLocate has to start within the tap itself for the browser to show its prompt.
  const ask = () => {
    if (access === 'denied') { onNotice('Location is blocked for this site. Allow it in your browser’s site settings, then tap the weather again.'); return }
    void onLocate().then((isLocated) => { if (!isLocated) onNotice('Could not get your location, so this is the weather for your property.') })
  }
  return (
    <button type="button" className="welcome-weather is-locatable" onClick={ask} disabled={isLocating} aria-label={`Weather in ${weather.city}: ${weather.temperature}°C. Tap to use your location instead.`}>
      <WeatherChip weather={weather} />{city}<span className="welcome-weather-hint">{isLocating ? 'Finding you…' : 'Tap for your location'}</span>
    </button>
  )
}
