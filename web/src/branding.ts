import { useSyncExternalStore } from 'react'

/** Public branding: the business name and logo version (null = no logo, show the raj.pg mark). */
export type Branding = { businessName: string | null; logoVersion: number | null }

let current: Branding = { businessName: null, logoVersion: null }
let loaded = false
const listeners = new Set<() => void>()

// Loaded once per page and shared by every brand mark (sidebar, portal header, sign-in screens),
// so a logo change can update them all without threading props through each screen.
function load() {
  fetch('/api/branding')
    .then((response) => response.ok ? response.json() as Promise<Branding> : Promise.reject(new Error('Branding request failed')))
    .then((branding) => { current = branding; listeners.forEach((listener) => listener()) })
    .catch(() => undefined)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!loaded) { loaded = true; load() }
  return () => listeners.delete(listener)
}

/** Current branding; re-renders when it loads or changes. */
export function useBranding() {
  return useSyncExternalStore(subscribe, () => current)
}

/** Re-fetches branding after the owner changes the logo or business name. */
export function refreshBranding() {
  load()
}

/** URL of the current logo, versioned so browsers pick up a new upload immediately. */
export const logoUrl = (version: number) => `/api/branding/logo?v=${version}`
