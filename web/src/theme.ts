/** The two views the app offers. */
export type Theme = 'light' | 'dark'

const storageKey = 'raj-pg-theme'

/** The viewer's explicit choice, if they made one; storage can be unavailable (private mode), so failures mean "none". */
export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/** Follows the device setting until the viewer picks a theme. */
export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applies a theme to the page (the dark stylesheet keys off this attribute). */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

/** Applies and remembers the viewer's choice. */
export function chooseTheme(theme: Theme) {
  applyTheme(theme)
  try {
    window.localStorage.setItem(storageKey, theme)
  } catch {
    // Choice still applies for this visit; it just will not be remembered.
  }
}
