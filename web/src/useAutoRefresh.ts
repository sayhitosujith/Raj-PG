import { useEffect, useRef } from 'react'

/** How often open views re-fetch their data. */
export const autoRefreshIntervalMs = 60_000

/**
 * Re-runs `reload` whenever a parent bumps `signal` (the refresh button or the one-minute timer),
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

/**
 * Calls `refresh` every minute while the tab is visible. Hidden tabs are skipped (no point
 * querying the database for a screen nobody sees); if a refresh was missed, it runs as soon as
 * the tab is shown again. The initial load stays with the caller's own effect.
 *
 * `refresh` should be silent: background updates must not flash loading states or error toasts.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = autoRefreshIntervalMs) {
  // Kept in a ref so callers can pass an inline function without restarting the timer each render.
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })

  useEffect(() => {
    let lastRun = Date.now()
    const run = () => { lastRun = Date.now(); refreshRef.current() }
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') run() }, intervalMs)
    const onVisibilityChange = () => { if (document.visibilityState === 'visible' && Date.now() - lastRun >= intervalMs) run() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [intervalMs])
}
