import { useSyncExternalStore } from 'react'
import { logoFavicon } from './logoFavicon'

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
    .then((branding) => { current = branding; applyFavicon(branding); listeners.forEach((listener) => listener()) })
    .catch(() => undefined)
}

// The browser tab icon lives outside React, so it is set here; without an uploaded logo it falls
// back to the static mark in public/favicon.svg. If cropping the logo fails, the whole logo is
// still better than the fallback mark.
function applyFavicon({ logoVersion }: Branding) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return
  link.removeAttribute('type')
  if (!logoVersion) { link.href = '/favicon.svg'; return }
  const source = logoUrl(logoVersion)
  logoFavicon(source).catch(() => source).then((href) => {
    // A newer logo may have been uploaded while this one was being cropped.
    if (current.logoVersion === logoVersion) link.href = href
  })
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
