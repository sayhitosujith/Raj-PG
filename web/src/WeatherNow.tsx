import { Cloud, CloudFog, CloudLightning, CloudRain, Moon, Snowflake, Sun, type LucideIcon } from 'lucide-react'
import type { Weather, WeatherCondition } from './weather'

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
