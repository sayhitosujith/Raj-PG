import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, chooseTheme, currentTheme, type Theme } from './theme'
import { useThemeClock } from './useThemeClock'

/**
 * Light/dark switch. The theme follows the device clock (light 7am–7pm, dark otherwise) and flips
 * by itself at those times; a click overrides it only until the next flip. The initial theme is
 * applied in main.tsx before first paint.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())

  useThemeClock(() => {
    const next = currentTheme()
    applyTheme(next)
    setTheme(next)
  })

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
