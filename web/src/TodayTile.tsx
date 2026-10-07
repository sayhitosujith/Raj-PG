import type { ReactNode } from 'react'

/**
 * One tile in the resident's "today" grid (date, holiday, local time) or the My Details card (weather), styled like the meal
 * tiles beneath it: an icon, a short label, and the value. `highlight` tints it, e.g. for a holiday;
 * `kind` gives the icon its own colour (see portalTheme.css).
 */
export function TodayTile({ icon, label, value, title, highlight = false, kind }: { icon: ReactNode; label: string; value: ReactNode; title?: string; highlight?: boolean; kind?: 'weather' | 'time' }) {
  return (
    <div className={`today-tile${highlight ? ' is-highlight' : ''}${kind ? ` is-${kind}` : ''}`} title={title}>
      <span className="today-tile-icon" aria-hidden="true">{icon}</span>
      <div className="today-tile-copy"><small>{label}</small><strong>{value}</strong></div>
    </div>
  )
}
