import { useMemo, useState, type ReactNode } from 'react'
import { BellRing, CalendarCheck, CheckCircle2, MessageSquare, RotateCw, Sparkles, XCircle } from 'lucide-react'
import { Avatar } from './Avatar'
import { describeVisit, formatTime, isOpenRequest, statusDetails, type HousekeepingStatus, type OwnerHousekeepingRequest } from './housekeeping'
import { todayDateInputValue } from './joinDate'
import type { ResidentsLoadState } from './ResidentsView'
import { Pagination } from './Pagination'
import { listPageSize, usePagination } from './usePagination'

type Filter = 'open' | 'reminders' | HousekeepingStatus | 'all'
const filters: Array<[Filter, string]> = [['open', 'Open'], ['reminders', 'Reminders'], ['REQUESTED', 'Requested'], ['SCHEDULED', 'Scheduled'], ['DONE', 'Done'], ['CANCELLED', 'Cancelled'], ['all', 'All']]

// A reply answers the resident (e.g. a missed visit) without changing the status.
const reply = { status: null, label: 'Reply', icon: MessageSquare, tone: 'secondary-button', notePrompt: 'e.g. "Sorry, she is on the way and will be there by 5pm"' }

// The owner's next steps from each state; mirrors the server's allowed transitions. A null
// status is a reply.
const actions: Record<HousekeepingStatus, Array<{ status: HousekeepingStatus | null; label: string; icon: typeof Sparkles; tone: string; notePrompt: string }>> = {
  REQUESTED: [
    { status: 'SCHEDULED', label: 'Schedule', icon: CalendarCheck, tone: 'primary-button', notePrompt: 'e.g. "Lakshmi will come at 10am"' },
    { status: 'DONE', label: 'Mark done', icon: CheckCircle2, tone: 'secondary-button', notePrompt: 'Optional note for the resident' },
    { status: 'CANCELLED', label: 'Cancel', icon: XCircle, tone: 'secondary-button', notePrompt: 'Tell the resident why, e.g. "No staff that day"' },
    reply,
  ],
  SCHEDULED: [
    { status: 'DONE', label: 'Mark done', icon: CheckCircle2, tone: 'primary-button', notePrompt: 'Optional note for the resident' },
    { status: 'CANCELLED', label: 'Cancel', icon: XCircle, tone: 'secondary-button', notePrompt: 'Tell the resident why, e.g. "No staff that day"' },
    reply,
  ],
  DONE: [],
  CANCELLED: [],
}

/** One request with its next-step buttons; a chosen action opens an inline note before confirming. */
function HousekeepingRow({ request, index, onUpdate }: { request: OwnerHousekeepingRequest; index: number; onUpdate: (status: HousekeepingStatus | null, ownerNote: string) => Promise<string | null> }) {
  const [pending, setPending] = useState<(typeof actions)[HousekeepingStatus][number] | null>(null)
  const [note, setNote] = useState(request.ownerNote ?? '')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const isDueToday = request.date.slice(0, 10) === todayDateInputValue()

  async function confirm() {
    if (!pending) return
    setIsSaving(true)
    const problem = await onUpdate(pending.status, note)
    setIsSaving(false)
    if (problem) { setError(problem); return }
    setPending(null)
    setError('')
  }

  return (
    <article className="housekeeping-item" style={{ '--stagger': Math.min(index, 10) } as React.CSSProperties}>
      <div className="housekeeping-item-main">
        <Avatar name={request.resident.name} photoUrl={request.resident.photoVersion ? `/api/residents/${request.resident.id}/photo?v=${request.resident.photoVersion}` : null} className="resident-avatar" />
        <div className="resident-info"><strong>{request.resident.name}{request.hasOpenReminder && <span className="resident-badge coral"><BellRing size={9} /> Reminder{request.reminderCount > 1 ? ` ×${request.reminderCount}` : ''}{request.lastReminderAt ? ` · ${formatTime(request.lastReminderAt)}` : ''}</span>}{request.isOverdue && <span className="resident-badge coral">Overdue</span>}{isDueToday && isOpenRequest(request) && !request.isOverdue && <span className="resident-badge gold">Today</span>}</strong><small>{request.resident.property} · Room {request.resident.room}</small></div>
        <div className="housekeeping-when"><strong>{describeVisit(request)}</strong>{request.note && <small>“{request.note}”</small>}</div>
        <span className={`status-pill ${statusDetails[request.status].tone}`}>{statusDetails[request.status].label}</span>
      </div>
      {request.ownerNote && !pending && <p className="housekeeping-owner-note">Your note: {request.ownerNote}</p>}
      {pending
        ? <div className="housekeeping-action-form">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder={pending.notePrompt} aria-label="Note for the resident" autoFocus />
            {error && <p className="login-error" role="alert">{error}</p>}
            <div className="aadhar-verification-actions"><button type="button" className="secondary-button" onClick={() => { setPending(null); setError('') }}>Back</button><button type="button" className={pending.status === 'CANCELLED' ? 'danger-button' : 'primary-button'} disabled={isSaving || (pending.status === null && !note.trim())} onClick={confirm}><pending.icon size={15} /> {isSaving ? 'Saving…' : pending.label}</button></div>
          </div>
        : actions[request.status].length > 0 && <div className="aadhar-verification-actions">{actions[request.status].map((action) => <button key={action.label} type="button" className={action.tone} onClick={() => setPending(action)}><action.icon size={15} /> {action.label}</button>)}</div>}
    </article>
  )
}

/**
 * Owner's Housekeeping page: what is due, who asked, and the buttons to move each request along.
 * `staff` is the staff panel, passed in so this view stays about requests.
 */
export function HousekeepingView({ requests, loadState, staff, onRetry, onUpdate, onBack }: { requests: OwnerHousekeepingRequest[]; staff?: ReactNode; loadState: ResidentsLoadState; onRetry: () => void; onUpdate: (request: OwnerHousekeepingRequest, status: HousekeepingStatus | null, ownerNote: string) => Promise<string | null>; onBack: () => void }) {
  const [filter, setFilter] = useState<Filter>('open')
  const today = todayDateInputValue()
  const visible = useMemo(() => requests.filter((request) => filter === 'all' || (filter === 'open' ? isOpenRequest(request) : filter === 'reminders' ? request.hasOpenReminder : request.status === filter)), [requests, filter])
  const pager = usePagination(visible, listPageSize, filter)
  const tiles = [
    { label: 'Reminders', value: requests.filter((r) => r.hasOpenReminder).length, filter: 'reminders' as Filter },
    { label: 'New requests', value: requests.filter((r) => r.status === 'REQUESTED').length, filter: 'REQUESTED' as Filter },
    { label: 'Scheduled', value: requests.filter((r) => r.status === 'SCHEDULED').length, filter: 'SCHEDULED' as Filter },
    { label: 'Due today', value: requests.filter((r) => isOpenRequest(r) && r.date.slice(0, 10) === today).length, filter: 'open' as Filter },
    { label: 'Completed', value: requests.filter((r) => r.status === 'DONE').length, filter: 'DONE' as Filter },
  ]

  return (
    <section className="workspace-view housekeeping-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Staff management</h2><p>Who works at each property, and cleaning requests from residents, soonest first.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div></div>
      {staff}
      <div className="workspace-summary residents-summary">{tiles.map((tile, index) => <button key={tile.label} type="button" className={`summary-tile${filter === tile.filter && tile.label !== 'Due today' ? ' is-selected' : ''}`} style={{ '--stagger': index } as React.CSSProperties} onClick={() => setFilter(tile.filter)}><span>{tile.label}</span><strong>{loadState === 'ready' ? tile.value : '–'}</strong></button>)}</div>
      <div className="filter-tabs" role="tablist" aria-label="Filter requests">{filters.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
      {loadState === 'loading' && <div className="resident-list" aria-busy="true">{[0, 1, 2].map((index) => <div className="resident-skeleton" key={index}><span className="skeleton-circle" /><span className="skeleton-lines"><span /><span /></span><span className="skeleton-pill" /></div>)}</div>}
      {loadState === 'error' && <div className="workspace-empty"><div className="workspace-empty-icon"><RotateCw size={22} /></div><h3>Requests could not be loaded</h3><p>Check your connection and try again.</p><button className="primary-button" onClick={onRetry}><RotateCw size={16} /> Retry</button></div>}
      {loadState === 'ready' && (visible.length
        ? <><div className="housekeeping-list">{pager.pageItems.map((request, index) => <HousekeepingRow key={request.id} request={request} index={index} onUpdate={(status, note) => onUpdate(request, status, note)} />)}</div><Pagination state={pager} label="Housekeeping requests" /></>
        : <div className="workspace-empty"><div className="workspace-empty-icon"><Sparkles size={22} /></div><h3>{filter === 'open' ? 'Nothing waiting' : 'No requests here'}</h3><p>{filter === 'open' ? 'New housekeeping requests from residents will appear here.' : 'Try another filter.'}</p></div>)}
    </section>
  )
}
