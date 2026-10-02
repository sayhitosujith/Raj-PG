import { Cloud, CloudFog, CloudLightning, CloudRain, Moon, Snowflake, Sun, type LucideIcon } from 'lucide-react'
import type { Weather, WeatherCondition } from './weather'

const conditionIcons: Record<WeatherCondition, LucideIcon> = { clear: Sun, clouds: Cloud, rain: CloudRain, storm: CloudLightning, snow: Snowflake, mist: CloudFog }

/**
 * The place and temperature under the local clock: "Current location: Area, City" when the device
 * shares its position, otherwise the property's city on its own, since labelling that "current"
 * would be wrong. Renders nothing when there is no weather, so an outage leaves no gap.
 */
export function WeatherNow({ weather }: { weather: Weather | null }) {
  if (!weather) return null
  const Icon = weather.condition === 'clear' && !weather.isDay ? Moon : conditionIcons[weather.condition]
  return (
    <p className="local-weather" title={weather.description || undefined}>
      <Icon size={13} aria-hidden="true" />
      <span>{weather.isCurrentLocation ? <>Current location: {weather.city}</> : weather.city}</span>
      <strong>{weather.temperature}°C</strong>
    </p>
  )
}
