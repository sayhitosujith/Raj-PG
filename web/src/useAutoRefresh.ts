import { useEffect, useRef } from 'react'
import { isOffline, isSlowConnection } from './networkStatus'

/** How often open views re-fetch their data, so new requests and changes show within seconds. */
export const autoRefreshIntervalMs = 10_000

/**
 * On 2G or Data Saver every poll is stretched by this factor: a 10-second poll there competes with the
 * screen the person is actually opening and burns their data. Live updates still refresh at once.
 */
const slowConnectionFactor = 3

/** For payloads too heavy to poll every few seconds, such as the owner dashboard with its property photos. */
export const slowRefreshIntervalMs = 60_000

/**
 * Re-runs `reload` whenever a parent bumps `signal` (the refresh button or the auto-refresh timer),
 * so every open view refreshes together from one trigger instead of running its own timers.
 * Compares against the last seen value, so React's development double-mount does not re-fetch.
 */
export function useRefreshSignal(signal: number, reload: () => void) {
  const reloadRef = useRef(reload)
  const lastSignal = useRef(signal)
  useEffect(() => { reloadRef.current = reload })
  useEffect(() => {
    if (lastSignal.current === signal) return
    lastSignal.current = signal
    reloadRef.current()
  }, [signal])
}

// One live-updates connection per page (see backend liveUpdates.ts), shared by every view that
// refreshes: when the server says something changed, they all re-fetch at once. It is open only while
// the tab is visible: browsers allow about six connections per address over HTTP/1.1 (the local dev
// server), so a stream held by every background tab would starve the visible tab's own requests.
// Coming back to a tab refreshes it anyway, and the timer below covers any stream that never connects.
const liveListeners = new Set<() => void>()
let liveSource: EventSource | null = null
function syncLiveSource() {
  const wanted = liveListeners.size > 0 && document.visibilityState === 'visible' && typeof EventSource !== 'undefined'
  if (wanted && !liveSource) {
    liveSource = new EventSource('/api/events')
    liveSource.onmessage = () => liveListeners.forEach((notify) => notify())
  } else if (!wanted && liveSource) {
    liveSource.close()
    liveSource = null
  }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', syncLiveSource)
function subscribeToLiveUpdates(listener: () => void) {
  liveListeners.add(listener)
  syncLiveSource()
  return () => { liveListeners.delete(listener); syncLiveSource() }
}

/**
 * Calls `refresh` every `intervalMs` while the tab is visible, as soon as the window is focused again, and the moment the server announces a change. Hidden tabs are skipped (no point
 * querying the database for a screen nobody sees); if a refresh was missed, it runs as soon as
 * the tab is shown again. The initial load stays with the caller's own effect.
 *
 * On a weak connection polls are spread out (see slowConnectionFactor); while offline they are skipped,
 * and the view refreshes the moment the connection comes back.
 *
 * `refresh` should be silent: background updates must not flash loading states or error toasts.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = autoRefreshIntervalMs) {
  // Kept in a ref so callers can pass an inline function without restarting the timer each render.
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })

  useEffect(() => {
    let lastRun = Date.now()
    // Read on every tick, not once, so switching Wi-Fi to 2G (or turning on Data Saver) takes effect at once.
    const dueEvery = () => intervalMs * (isSlowConnection() ? slowConnectionFactor : 1)
    const canRun = () => document.visibilityState === 'visible' && !isOffline()
    const run = () => { lastRun = Date.now(); refreshRef.current() }
    // The timer ticks at the normal rate; on a slow connection most ticks find the refresh not yet due.
    // The 50 ms slack stops timer jitter from skipping a tick that is due.
    const timer = window.setInterval(() => { if (canRun() && Date.now() - lastRun >= dueEvery() - 50) run() }, intervalMs)
    const onVisibilityChange = () => { if (canRun() && Date.now() - lastRun >= dueEvery()) run() }
    // Clicking back into the window (e.g. two windows side by side) refreshes at once rather than on
    // the next tick; a short gap stops a burst of focus events from fetching twice.
    const onFocus = () => { if (canRun() && Date.now() - lastRun >= 2_000) run() }
    const onOnline = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    // A change announced by the server refreshes straight away while the tab is on screen.
    const unsubscribe = subscribeToLiveUpdates(run)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibilityChange); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onOnline); unsubscribe() }
  }, [intervalMs])
}
