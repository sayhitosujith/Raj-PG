import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

/**
 * One notification. `id` must change whenever the news changes (a new status, a new month), so a
 * fresh update counts as unread again; `at` orders the list, newest first, when it is known.
 */
export type Notice = { id: string; title: string; detail?: string | null; at?: string | null; /** Shown as a small badge, e.g. "Announcement". */ kind: NoticeKind }

/** What a notice is about, shown as its badge. */
export type NoticeKind = 'Announcement' | 'Rent' | 'Move-out' | 'Repair' | 'Account' | 'Food' | 'ID check' | 'Housekeeping'

// When this resident read each notice, per device (localStorage): notice id -> time read (ms). A read
// notice (one the resident clicked) is cleared from view; its record is kept, so it does
// not come back as unread. A per-device convenience: if storage is cleared or blocked, notices just
// show as unread once more. Capped to the most recently read so it cannot grow forever.
const maxRemembered = 200
const storageKey = (ownerId: string) => `staynest-notices-seen:${ownerId}`
type ReadAt = Record<string, number>
function readSeen(ownerId: string): ReadAt {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(ownerId)) ?? '{}') as ReadAt | string[]
    // The first version stored only the ids; count those as read now.
    return Array.isArray(stored) ? Object.fromEntries(stored.map((id) => [id, Date.now()])) : stored
  } catch {
    return {}
  }
}
function saveSeen(ownerId: string, seen: ReadAt) {
  const newest = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, maxRemembered)
  try { window.localStorage.setItem(storageKey(ownerId), JSON.stringify(Object.fromEntries(newest))) } catch { /* storage blocked */ }
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
// "Move-out" -> "moveout", "ID check" -> "idcheck": the CSS class suffix for a kind's colours.
const kindClass = (kind: NoticeKind) => kind.toLowerCase().replace(/[^a-z]/g, '')

/**
 * The bell in the resident portal's top bar: a count of unread notices and, when tapped, a panel
 * listing them newest first. A notice is read only when the resident clicks it, which clears just
 * that one from the panel and the count; opening the panel marks nothing. Closes on a tap outside,
 * Escape, or the bell.
 */
export function NotificationBell({ ownerId, notices }: { ownerId: string; notices: Notice[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [seen, setSeen] = useState(() => readSeen(ownerId))
  const wrapperRef = useRef<HTMLDivElement>(null)
  const unread = notices.filter((notice) => seen[notice.id] === undefined)
  const sorted = [...unread].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = (event: MouseEvent) => { if (!wrapperRef.current?.contains(event.target as Node)) setIsOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [isOpen])

  function markRead(id: string) {
    const next = { ...seen, [id]: Date.now() }
    setSeen(next)
    saveSeen(ownerId, next)
  }
  const toggle = () => setIsOpen((open) => !open)

  return (
    <div className="notification-bell" ref={wrapperRef}>
      <button type="button" className="secondary-button notification-bell-button" aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'} aria-expanded={isOpen} onClick={toggle}>
        <Bell size={16} />
        {unread.length > 0 && <span className="notification-count" aria-hidden="true">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {isOpen && <div className="notification-panel" role="dialog" aria-label="Notifications">
        <p className="notification-panel-title">Notifications</p>
        {sorted.length
          ? <ul>{sorted.map((notice) => <li key={notice.id} className={`is-kind-${kindClass(notice.kind)}`}><button type="button" className="notification-item" title="Mark as read" onClick={() => markRead(notice.id)}><span className={`notice-kind is-${kindClass(notice.kind)}`}>{notice.kind}</span><strong>{notice.title}</strong>{notice.detail && <small>{notice.detail}</small>}{notice.at && <time dateTime={notice.at}>{when(notice.at)}</time>}</button></li>)}</ul>
          : <p className="notification-empty">You're all caught up.</p>}
      </div>}
    </div>
  )
}
