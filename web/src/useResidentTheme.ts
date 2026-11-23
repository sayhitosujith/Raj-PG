import { useEffect } from 'react'
import { applyTheme, currentTheme, type Theme } from './theme'
import type { ResidentTheme } from './workspaceSettings'

// "Auto" (day/night by the clock) is no longer offered; workspaces still saved on it get light.
const fixedTheme: Record<ResidentTheme, Theme> = { AUTO: 'light', LIGHT: 'light', DARK: 'dark' }

/**
 * Applies the owner's choice of view to the resident portal: light or dark. Residents cannot change it, so any pick
 * saved earlier by their own toggle is ignored. Leaving the portal (signing out) restores the device's usual theme.
 */
export function useResidentTheme(mode: ResidentTheme) {
  useEffect(() => {
    applyTheme(fixedTheme[mode])
    return () => applyTheme(currentTheme())
  }, [mode])
}
