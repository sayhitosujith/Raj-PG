import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, chooseTheme, currentTheme, nextThemeSwitch, type Theme } from './theme'

/**
 * Light/dark switch. The theme follows the device clock (light 7am–7pm, dark otherwise) and flips
 * by itself at those times; a click overrides it only until the next flip. The initial theme is
 * applied in main.tsx before first paint.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())

  useEffect(() => {
    let timer: number
    const sync = () => {
      const next = currentTheme()
      applyTheme(next)
      setTheme(next)
      window.clearTimeout(timer)
      // A second past the switch, so the clock is clearly on the new side of it.
      timer = window.setTimeout(sync, nextThemeSwitch().getTime() - Date.now() + 1000)
    }
    // Background tabs throttle timers and laptops sleep, so re-check when the page is shown again.
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    timer = window.setTimeout(sync, nextThemeSwitch().getTime() - Date.now() + 1000)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    chooseTheme(next)
    setTheme(next)
  }

  const label = theme === 'dark' ? 'Switch to light view (until the next day/night change)' : 'Switch to dark view (until the next day/night change)'
  return (
    <button type="button" className={`icon-button theme-toggle ${className}`.trim()} onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
