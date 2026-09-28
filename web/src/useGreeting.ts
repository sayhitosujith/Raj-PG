import { useEffect, useState } from 'react'
import { propertyMinutesIntoDay } from './propertyTime'

/** Maps an hour (0–23, local time) to a greeting: morning 5–11, afternoon 12–16, evening otherwise. */
export function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Current greeting and date from the device clock (the viewer's own day), and the time of day at
 * the property for meal status. Re-evaluates every minute because the dashboard is often left
 * open across a morning/afternoon/evening boundary.
 */
export function useGreeting() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return {
    greeting: greetingFor(now.getHours()),
    dateLabel: now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    // At the property (IST), not the device: meal times are IST, so "Now serving" must be too.
    minutesIntoDay: propertyMinutesIntoDay(now),
  }
}
