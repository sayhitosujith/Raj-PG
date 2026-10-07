import { useEffect } from 'react'
import { applyTheme, currentTheme, timeTheme, type Theme } from './theme'
import { useThemeClock } from './useThemeClock'
import type { ResidentTheme } from './workspaceSettings'

const fixedTheme: Record<ResidentTheme, Theme | null> = { AUTO: null, LIGHT: 'light', DARK: 'dark' }

/**
 * Applies the owner's choice of view to the resident portal: always light, always dark, or by the
 * clock (Auto). Residents cannot change it, so any pick saved earlier by their own toggle is ignored.
 * Leaving the portal (signing out) restores the device's usual theme.
 */
export function useResidentTheme(mode: ResidentTheme) {
  const themeNow = () => fixedTheme[mode] ?? timeTheme()
  useEffect(() => {
    applyTheme(fixedTheme[mode] ?? timeTheme())
    return () => applyTheme(currentTheme())
  }, [mode])
  useThemeClock(() => applyTheme(themeNow()), mode === 'AUTO')
}
