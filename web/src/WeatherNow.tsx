import { Cloud, CloudFog, CloudLightning, CloudRain, Moon, Snowflake, Sun, type LucideIcon } from 'lucide-react'
import type { Weather, WeatherCondition } from './weather'

const conditionIcons: Record<WeatherCondition, LucideIcon> = { clear: Sun, clouds: Cloud, rain: CloudRain, storm: CloudLightning, snow: Snowflake, mist: CloudFog }

/**
 * The city and temperature where the resident's property is, under the local clock. Renders
 * nothing when there is no weather to show, so an outage or an unset city leaves no gap.
 */
export function WeatherNow({ weather }: { weather: Weather | null }) {
  if (!weather) return null
  const Icon = weather.condition === 'clear' && !weather.isDay ? Moon : conditionIcons[weather.condition]
  return (
    <p className="local-weather" title={weather.description || undefined}>
      <Icon size={13} aria-hidden="true" />
      <span>{weather.city}</span>
      <strong>{weather.temperature}°C</strong>
    </p>
  )
}
