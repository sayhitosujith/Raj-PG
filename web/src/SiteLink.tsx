import type { ReactNode } from 'react'
import { navigate, withinSite } from './router'

/**
 * A link within the website that changes page without a reload. It is still a real link, so
 * Ctrl/Cmd-click and middle-click open a new tab and the address shows on hover. On /website, home-page
 * links stay there (withinSite) instead of going to "/", which signed-in staff see as the dashboard.
 */
export function SiteLink({ to, className, children, onNavigate, ...rest }: { to: string; className?: string; children: ReactNode; onNavigate?: () => void; 'aria-current'?: 'page' }) {
  const target = withinSite(to)
  return (
    <a href={target} className={className} {...rest} onClick={(event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      onNavigate?.()
      navigate(target)
    }}>{children}</a>
  )
}
