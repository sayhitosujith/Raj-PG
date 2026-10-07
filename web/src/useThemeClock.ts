import { useEffect, useRef } from 'react'
import { nextThemeSwitch } from './theme'

/**
 * Calls `onSwitch` at each 7am/7pm day/night change, and when the page is shown again (background
 * tabs throttle timers and laptops sleep, so a switch can be missed). Shared by the theme toggle and
 * the resident portal's owner-set "Auto" view. Off while `enabled` is false.
 */
export function useThemeClock(onSwitch: () => void, enabled = true) {
  // The latest callback, so the timer never runs a stale one and is not reset on every render.
  const callback = useRef(onSwitch)
  callback.current = onSwitch

  useEffect(() => {
    if (!enabled) return
    let timer: number
    const schedule = () => {
      window.clearTimeout(timer)
      // A second past the switch, so the clock is clearly on the new side of it.
      timer = window.setTimeout(() => { callback.current(); schedule() }, nextThemeSwitch().getTime() - Date.now() + 1000)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') { callback.current(); schedule() } }
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled])
}
