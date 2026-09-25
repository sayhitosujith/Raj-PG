import { useEffect, useState } from 'react'

/** Maps an hour (0–23, local time) to a greeting: morning 5–11, afternoon 12–16, evening otherwise. */
export function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Current greeting and date from the device clock. Re-evaluates every minute because the
 * dashboard is often left open across a morning/afternoon/evening boundary.
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
    // Exposed so other time-of-day UI (e.g. "Now serving" meals) shares this one-minute clock.
    minutesIntoDay: now.getHours() * 60 + now.getMinutes(),
  }
}
