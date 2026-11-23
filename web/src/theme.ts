/** The two views the app offers. */
export type Theme = 'light' | 'dark'

// The viewer's own pick, kept until they change it. A new key: picks saved under the old day/night scheme expired at
// the next 7am/7pm switch and must not be read back as permanent choices.
const choiceKey = 'raj-pg-theme-choice'

/** The theme to show: the viewer's saved pick, else light. There is no automatic switching by time of day. */
export function currentTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(choiceKey)
    return saved === 'dark' ? 'dark' : 'light'
  } catch {
    // Storage can be unavailable (private mode): light, as on a first visit.
    return 'light'
  }
}

/** Applies a theme to the page (the dark stylesheet keys off this attribute). */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

/** Applies the viewer's pick and remembers it on this device. */
export function chooseTheme(theme: Theme) {
  applyTheme(theme)
  try {
    window.localStorage.setItem(choiceKey, theme)
  } catch {
    // The pick still applies for this visit; it just will not be remembered.
  }
}
