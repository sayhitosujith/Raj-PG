import { useEffect, useSyncExternalStore } from 'react'
import { logoFavicon } from './logoFavicon'
import type { PageColours } from './useAdminBrand'

/**
 * Public branding: the business name, logo version (null = no logo, show the StayPilot mark) and the
 * colours chosen under Views (each null = the default), so the sign-in page matches the app.
 */
export type Branding = { businessName: string | null; logoVersion: number | null; colours: PageColours | null }

let current: Branding = { businessName: null, logoVersion: null, colours: null }
let loaded = false
const listeners = new Set<() => void>()

// Shared by every brand mark (sidebar, portal header, sign-in screens), so a logo change can update
// them all without threading props through each screen. Re-fetched often on the sign-in page (see
// useBrandingAutoRefresh), so nothing re-renders and the favicon is not re-cropped unless it changed.
function load() {
  fetch('/api/branding')
    .then((response) => response.ok ? response.json() as Promise<Branding> : Promise.reject(new Error('Branding request failed')))
    .then((branding) => {
      failures = 0
      if (JSON.stringify(branding) === JSON.stringify(current)) return
      const isNewLogo = branding.logoVersion !== current.logoVersion
      current = branding
      if (isNewLogo) applyFavicon(branding)
      listeners.forEach((listener) => listener())
    })
    .catch(retryLater)
}

// A failed load is tried again: the API often times out while its server wakes up (a 504 through the
// proxy), and without a retry the logo, business name and tab icon stayed missing until a reload.
// Waits 3 s, 10 s, 30 s, then a minute between tries; one retry at a time.
const retryDelaysMs = [3_000, 10_000, 30_000, 60_000]
let failures = 0
let retryTimer: number | undefined
function retryLater() {
  if (retryTimer !== undefined) return
  const delay = retryDelaysMs[Math.min(failures, retryDelaysMs.length - 1)]
  failures += 1
  retryTimer = window.setTimeout(() => { retryTimer = undefined; load() }, delay)
}

const brandingRefreshMs = 15_000

/**
 * Keeps branding current on the sign-in page, which has no live-updates stream (that needs a session):
 * re-fetches when the window is focused or the tab shown, and every 15 seconds while it is on screen,
 * so colours or a logo changed in another window show up without a reload.
 */
export function useBrandingAutoRefresh() {
  useEffect(() => {
    const refreshIfVisible = () => { if (document.visibilityState === 'visible') load() }
    const timer = window.setInterval(refreshIfVisible, brandingRefreshMs)
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshIfVisible); document.removeEventListener('visibilitychange', refreshIfVisible) }
  }, [])
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
