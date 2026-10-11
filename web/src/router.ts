import { useSyncExternalStore } from 'react'

/**
 * Minimal client-side routing for the public website and /login: the current path, and `navigate`
 * to change it without a page load. The app has no router library and the site needs only a few fixed
 * paths, so the browser history plus a listener is enough.
 */
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => { listeners.delete(listener); window.removeEventListener('popstate', listener) }
}

/** The current path ("/", "/pg/abc", "/login"…); re-renders on navigation and Back/Forward. */
export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/**
 * Goes to `to` ("/contact", "/#properties") without reloading. A hash scrolls to that section once the
 * page has rendered; otherwise the new page starts at the top. `replace` swaps the history entry
 * (used for redirects such as /login → / after signing in).
 */
export function navigate(to: string, { replace = false } = {}) {
  const [path, hash] = to.split('#')
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  listeners.forEach((listener) => listener())
  window.requestAnimationFrame(() => {
    const target = hash ? document.getElementById(hash) : null
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else if (path) window.scrollTo(0, 0)
  })
}

/** The website's addresses, in one place so links and the page switch cannot drift apart. */
export const sitePaths = {
  home: '/',
  properties: '/#properties',
  property: (id: string) => `/pg/${encodeURIComponent(id)}`,
  foodAndRules: '/food-and-rules',
  contact: '/contact',
  bookVisit: '/contact#book',
  login: '/login',
}

/** Website pages that never need a session ("/" shows the site only when signed out; see AuthGate). */
export const isPublicSitePath = (path: string) => path.startsWith('/pg/') || path === sitePaths.foodAndRules || path === sitePaths.contact
