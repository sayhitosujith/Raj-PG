import { Cloud, CloudFog, CloudLightning, CloudRain, Moon, Snowflake, Sun, type LucideIcon } from 'lucide-react'
import { TodayTile } from './TodayTile'
import type { Weather, WeatherCondition } from './weather'

const conditionIcons: Record<WeatherCondition, LucideIcon> = { clear: Sun, clouds: Cloud, rain: CloudRain, storm: CloudLightning, snow: Snowflake, mist: CloudFog }

/**
 * The place and temperature as a today tile, labelled "Current location" when the device shares its
 * position and "Weather" for the property's city, since calling that "current" would be wrong.
 * Renders nothing when there is no weather, so an outage leaves no gap.
 */
export function WeatherNow({ weather }: { weather: Weather | null }) {
  if (!weather) return null
  const Icon = weather.condition === 'clear' && !weather.isDay ? Moon : conditionIcons[weather.condition]
  return <TodayTile icon={<Icon size={16} />} label={weather.isCurrentLocation ? 'Current location' : 'Weather'} value={<>{weather.city} · {weather.temperature}°C</>} title={[weather.description, weather.accuracyM !== undefined ? `Location accurate to about ${weather.accuracyM} m` : ''].filter(Boolean).join(' · ') || undefined} />
}
