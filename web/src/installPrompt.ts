import { useSyncExternalStore } from 'react'

/** Chrome/Edge/Android's "install this app" event (not in TypeScript's DOM types yet). */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

// The browser offers installation once, possibly before any screen that uses it has mounted, so the
// offer is caught here, at load, and kept until the website's app sheet asks for it.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferred = event as InstallPromptEvent; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether this browser has offered to install the app (Chrome, Edge, Samsung Internet on Android). */
export function useCanInstall() {
  return useSyncExternalStore(subscribe, () => deferred !== null)
}

/** Shows the browser's install dialog; resolves to whether the person installed. */
export async function promptInstall() {
  if (!deferred) return false
  const event = deferred
  deferred = null
  notify()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

/** True when running as the installed app (opened from the home screen), where installing makes no sense. */
export const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone/iPad Safari, which installs only through Share → Add to Home Screen. */
export const isAppleMobile = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
