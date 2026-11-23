import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { chooseTheme, currentTheme, type Theme } from './theme'

/**
 * Light/dark switch. The app starts light and only changes when the viewer clicks this; the pick is remembered on the
 * device. The initial theme is applied in main.tsx before first paint.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    chooseTheme(next)
    setTheme(next)
  }

  const label = theme === 'dark' ? 'Switch to light view' : 'Switch to dark view'
  return (
    <button type="button" className={`icon-button theme-toggle ${className}`.trim()} onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
