/** The two views the app offers. */
export type Theme = 'light' | 'dark'

// Light by day, dark by night, on the device's clock.
const dayStartsAt = 7
const nightStartsAt = 19

// A manual pick lasts only until the next day/night switch, so the clock always takes over again.
// (A new key: plain "light"/"dark" values saved by the old toggle would otherwise stick forever.)
const overrideKey = 'raj-pg-theme-override'

/** The theme the clock calls for at a given moment. */
export function timeTheme(now = new Date()): Theme {
  const hour = now.getHours()
  return hour >= dayStartsAt && hour < nightStartsAt ? 'light' : 'dark'
}

/** The next 7am or 7pm after `now`, when the time-based theme flips. */
export function nextThemeSwitch(now = new Date()) {
  const next = new Date(now)
  next.setMinutes(0, 0, 0)
  const hour = now.getHours()
  if (hour < dayStartsAt) next.setHours(dayStartsAt)
  else if (hour < nightStartsAt) next.setHours(nightStartsAt)
  else { next.setDate(next.getDate() + 1); next.setHours(dayStartsAt) }
  return next
}

// Storage can be unavailable (private mode), so failures mean "no override".
function storedOverride(now: Date): Theme | null {
  try {
    const { theme, until } = JSON.parse(window.localStorage.getItem(overrideKey) ?? 'null') ?? {}
    return (theme === 'light' || theme === 'dark') && typeof until === 'number' && until > now.getTime() ? theme : null
  } catch {
    return null
  }
}

/** The theme to show now: an unexpired manual pick, otherwise the clock's. */
export function currentTheme(now = new Date()): Theme {
  return storedOverride(now) ?? timeTheme(now)
}

/** Applies a theme to the page (the dark stylesheet keys off this attribute). */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

/** Applies the viewer's pick and remembers it until the next day/night switch. */
export function chooseTheme(theme: Theme, now = new Date()) {
  applyTheme(theme)
  try {
    window.localStorage.setItem(overrideKey, JSON.stringify({ theme, until: nextThemeSwitch(now).getTime() }))
  } catch {
    // The pick still applies for this visit; it just will not be remembered.
  }
}
