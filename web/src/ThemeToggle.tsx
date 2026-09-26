import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, chooseTheme, storedTheme, systemTheme, type Theme } from './theme'

/**
 * Light/dark switch. Until the viewer picks, it follows the device setting (and live changes to
 * it); after that their choice sticks. The initial theme is applied in main.tsx before first paint.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const followSystem = () => { if (!storedTheme()) { const next = systemTheme(); applyTheme(next); setTheme(next) } }
    query.addEventListener('change', followSystem)
    return () => query.removeEventListener('change', followSystem)
  }, [])

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
