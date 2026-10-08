import { useEffect } from 'react'
import type { WorkspaceSettings } from './workspaceSettings'

// Each chosen colour: the CSS variable it sets on the page root, and the flag that turns its rules on.
const colourSettings = [
  ['portalThemeColor', '--brand', 'brand'],
  ['portalButtonTextColor', '--brand-on', 'brandOn'],
  ['portalErrorColor', '--brand-error', 'brandError'],
  ['portalTextColor', '--brand-ink', 'brandInk'],
  ['portalPlaceholderColor', '--placeholder', 'brandPlaceholder'],
] as const

/**
 * Applies the owner's portal colours to the admin pages too. They go on the page root rather than
 * the app's own element, because pop-ups open at the top of the page (see ModalLayer). The admin's
 * green is only replaced once a theme colour is chosen; until then it stays exactly as designed.
 * Leaving the admin (signing out) takes them off again.
 */
export function useAdminBrand(settings: WorkspaceSettings | null) {
  const colours = colourSettings.map(([field]) => settings?.[field] ?? null)
  useEffect(() => {
    const root = document.documentElement
    colourSettings.forEach(([, variable, flag], index) => {
      const colour = colours[index]
      if (colour) { root.style.setProperty(variable, colour); root.dataset[flag] = '' } else { root.style.removeProperty(variable); delete root.dataset[flag] }
    })
    return () => colourSettings.forEach(([, variable, flag]) => { root.style.removeProperty(variable); delete root.dataset[flag] })
  }, colours) // eslint-disable-line react-hooks/exhaustive-deps -- the four colours are the dependencies
}
