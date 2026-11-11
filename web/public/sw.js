/*
 * StayNest service worker: keeps the app usable on a weak or missing connection.
 *
 * - Pages (navigations): network first; if the network fails or takes longer than SLOW_NETWORK_MS,
 *   the last saved app shell (index.html) opens instead, so the app starts with no signal.
 * - /assets/*: Vite names these by content hash, so a saved copy is never out of date and is used
 *   without asking the network. Saved as they are first used, not all up front, so a first visit on
 *   2G does not download every screen and flag.
 * - GET /api/*: network first. When the network fails, answers 5xx or is slower than SLOW_NETWORK_MS,
 *   the last saved answer is used and the page is told how old it is (see web/src/networkStatus.ts).
 *   With nothing saved the request simply waits for the network: a slow answer is never turned into
 *   an error. The server sends `no-store` so browsers and Netlify never reuse API answers; this saved
 *   copy is separate and only ever stands in when the live answer cannot arrive.
 * - Writes (POST/PUT/PATCH/DELETE) are never saved or replayed: payments, door access and approvals
 *   must be confirmed by the server. Once the server answers a write, saved API data is dropped, so
 *   a slow refresh right after an action cannot show the screen as it was before it.
 * - Signing in or out and acting as a resident drop saved API data before the request is sent, so
 *   one person's data is never shown to the next person on the same device.
 * - /api/events (the live-updates stream) is left to the browser.
 *
 * Bump VERSION only when the cache layout changes; activation then deletes the old caches.
 */
const VERSION = 1
const SHELL_CACHE = `staynest-shell-v${VERSION}`
const ASSET_CACHE = `staynest-assets-v${VERSION}`
const API_CACHE = `staynest-api-v${VERSION}`
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, API_CACHE]
const SHELL_URL = '/index.html'

// Long enough that a working 3G connection still gets live data, short enough that a stalled one does
// not leave the person staring at a loader.
const SLOW_NETWORK_MS = 4000
// Saved API answers older than this are not shown: very old data would mislead more than it helps,
// and personal data should not linger on the device indefinitely.
const SAVED_DATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
// Each deploy brings new hashed files; this keeps old ones from piling up (the ~250 flag images fit).
const MAX_SAVED_ASSETS = 400
const SAVED_AT_HEADER = 'x-staynest-saved-at'

// Requests after which the same API address can return a different person's data.
const IDENTITY_CHANGE = /^\/api\/(auth\/(login|logout)|act-as\/|resident-portal\/passkey-login$)/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('staynest-') && !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isApi = url.pathname.startsWith('/api/')
  if (request.method !== 'GET') {
    if (isApi && request.method !== 'HEAD') event.respondWith(sendWrite(request, url.pathname))
    return
  }
  if (url.pathname === '/api/events') return
  if (isApi) {
    // A receipt or ID document opened in its own tab: no app shell involved, nothing to save.
    if (request.mode !== 'navigate') event.respondWith(apiResponse(event))
    return
  }
  if (request.mode === 'navigate') event.respondWith(shellResponse(event))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(assetResponse(event))
})

/** Resolves to `promise`'s value if it settles within `ms`, otherwise (or on failure) to null. */
function firstWithin(promise, ms) {
  return Promise.race([promise.catch(() => null), new Promise((resolve) => setTimeout(() => resolve(null), ms))])
}

function forgetSavedApiData() {
  return caches.delete(API_CACHE)
}

async function sendWrite(request, path) {
  if (IDENTITY_CHANGE.test(path)) await forgetSavedApiData()
  const response = await fetch(request)
  // Any answer means the server saw the write; a request that never arrived keeps the saved data,
  // which is what an offline person still needs to see.
  await forgetSavedApiData()
  return response
}

async function shellResponse(event) {
  const cache = await caches.open(SHELL_CACHE)
  const network = fetch(event.request).then(async (response) => {
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) await cache.put(SHELL_URL, response.clone())
    return response
  })
  event.waitUntil(network.catch(() => undefined))
  const saved = await cache.match(SHELL_URL)
  if (!saved) return network
  return (await firstWithin(network.then((response) => (response.ok ? response : null)), SLOW_NETWORK_MS)) ?? saved
}

async function assetResponse(event) {
  const cache = await caches.open(ASSET_CACHE)
  const saved = await cache.match(event.request)
  if (saved) return saved
  const response = await fetch(event.request)
  // A file missing after a deploy comes back as index.html (the single-page fallback); never save that
  // under a script's address.
  if (response.ok && !(response.headers.get('content-type') || '').includes('text/html')) {
    event.waitUntil(cache.put(event.request, response.clone()).then(() => trimAssets(cache)))
  }
  return response
}

async function trimAssets(cache) {
  const keys = await cache.keys()
  // Keys come back in insertion order, so the oldest files go first.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_SAVED_ASSETS)).map((key) => cache.delete(key)))
}

// Several views (and several tabs) often ask for the same address at once, e.g. after a live update.
// On a slow link separate requests would compete for the same bandwidth, so they share one.
const inFlight = new Map()

/** One network request per address at a time; every caller gets its own copy of the answer. */
function sharedFetch(request) {
  let pending = inFlight.get(request.url)
  if (!pending) {
    pending = fetch(request).finally(() => inFlight.delete(request.url))
    inFlight.set(request.url, pending)
  }
  return pending.then((response) => response.clone())
}

async function apiResponse(event) {
  const { request } = event
  const cache = await caches.open(API_CACHE)
  const network = sharedFetch(request)
  event.waitUntil(network.then((response) => saveApiResponse(cache, request, response), () => undefined))

  const saved = await savedApiResponse(cache, request)
  if (!saved) return network.then((response) => { tell(event, { type: 'served-live' }); return response })

  const live = await firstWithin(network.then((response) => (response.status >= 500 ? null : response)), SLOW_NETWORK_MS)
  if (live) { tell(event, { type: 'served-live' }); return live }
  tell(event, { type: 'served-saved', savedAt: Number(saved.headers.get(SAVED_AT_HEADER)) })
  return saved
}

async function saveApiResponse(cache, request, response) {
  // Cloned before anything else: the page reads this same response, and a body can be read only once.
  const copy = response.clone()
  // The session ended: nothing saved for it may be shown any more.
  if (response.status === 401) { await forgetSavedApiData(); return }
  // JSON only: images keep their own long browser cache, and ID documents are deliberately never stored.
  if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return
  const headers = new Headers(copy.headers)
  headers.set(SAVED_AT_HEADER, String(Date.now()))
  await cache.put(request, new Response(await copy.blob(), { status: copy.status, statusText: copy.statusText, headers }))
}

async function savedApiResponse(cache, request) {
  const saved = await cache.match(request, { ignoreVary: true })
  if (!saved) return undefined
  if (Date.now() - Number(saved.headers.get(SAVED_AT_HEADER)) <= SAVED_DATA_MAX_AGE_MS) return saved
  await cache.delete(request, { ignoreVary: true })
  return undefined
}

function tell(event, message) {
  if (event.clientId) self.clients.get(event.clientId).then((client) => client?.postMessage(message), () => undefined)
}
