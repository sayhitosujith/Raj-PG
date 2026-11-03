import { useEffect, useMemo, useState } from 'react'
import { RotateCw, Search, Send, UserPlus, Users } from 'lucide-react'
import type { Resident } from './resident'
import { applyResidentQuery, defaultResidentQuery, summarizeResidents, type ResidentQuery, type ResidentSort, type ResidentStatusFilter } from './residentFilters'
import { ResidentRow, type AadharDecision } from './ResidentRow'
import { Pagination } from './Pagination'
import { listPageSize, usePagination } from './usePagination'

/** Where the resident list is in its lifecycle; drives skeleton, error, and empty states. */
export type ResidentsLoadState = 'loading' | 'ready' | 'error'

const placeholderRows = 3

const statusOptions: Array<[ResidentStatusFilter, string]> = [['all', 'All statuses'], ['active', 'Active'], ['inactive', 'Inactive'], ['awaiting', 'Awaiting first sign-in'], ['verification', 'Aadhaar pending review'], ['rent-overdue', 'Rent overdue']]
const sortOptions: Array<[ResidentSort, string]> = [['recent', 'Recently joined'], ['longest', 'Longest stay'], ['name', 'Name A–Z'], ['room', 'Room number']]

/** Residents screen: summary tiles, search/filter/sort toolbar, and the expandable resident list. */
export function ResidentsView({ residents, securityDeposit, doorKeysEnabled, loadState, focus, onRetry, onAdd, onInvite, onEdit, onClone, onDelete, onVerify, onRecordRent, onUndoRent, onChanged, onNotice, onBack }: { residents: Resident[]; /** From Settings; shown against dues in move-out notices. */ securityDeposit: number | null; /** Settings → Smart lock. */ doorKeysEnabled: boolean; /** A resident to jump to (from a notification); `key` changes on every request, so the same one can be asked for twice. */ focus?: { residentId: string; key: number } | null; onChanged: () => void; onNotice: (message: string) => void; loadState: ResidentsLoadState; onRetry: () => void; onAdd: () => void; /** Opens "Send registration link", for a new resident to fill in their own details. */ onInvite: () => void; onEdit: (resident: Resident) => void; onClone: (resident: Resident) => void; onDelete: (resident: Resident) => void; onVerify: (resident: Resident, decision: AadharDecision) => Promise<string | null>; onRecordRent: (resident: Resident, month: string) => Promise<string | null>; onUndoRent: (resident: Resident, paymentId: string) => Promise<string | null>; onBack: () => void }) {
  const [query, setQuery] = useState<ResidentQuery>(defaultResidentQuery)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())

  // Jumping to a resident: search for them (so they are on page 1 whatever the filters were) and open their row,
  // once per request. Done while rendering, React's pattern for state that follows a prop; the scroll waits for
  // the row to be on screen. Waits for the residents list when it is still loading.
  const [handledFocusKey, setHandledFocusKey] = useState<number | null>(null)
  const focusResident = focus && focus.key !== handledFocusKey ? residents.find((item) => item.id === focus.residentId) : undefined
  if (focus && focusResident) {
    setHandledFocusKey(focus.key)
    setQuery({ ...defaultResidentQuery, search: focusResident.phone ?? focusResident.name })
    setExpandedIds(new Set([focusResident.id]))
  }
  useEffect(() => {
    if (!focus || handledFocusKey !== focus.key) return
    const frame = window.requestAnimationFrame(() => document.querySelector(`[data-resident-id="${focus.residentId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => window.cancelAnimationFrame(frame)
  }, [focus, handledFocusKey])
  const visibleResidents = useMemo(() => applyResidentQuery(residents, query), [residents, query])
  // A new search, filter or sort starts again at page 1.
  const pager = usePagination(visibleResidents, listPageSize, JSON.stringify(query))
  const summary = useMemo(() => summarizeResidents(residents), [residents])
  // Only properties that actually have residents are worth filtering by.
  const propertyOptions = useMemo(() => [...new Map(residents.map((resident) => [resident.propertyId, resident.property])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [residents])
  const isFiltered = query.search !== defaultResidentQuery.search || query.propertyId !== defaultResidentQuery.propertyId || query.status !== defaultResidentQuery.status

  const update = (change: Partial<ResidentQuery>) => setQuery((current) => ({ ...current, ...change }))
  // Tiles double as quick filters; clicking the active one again clears it.
  const toggleStatus = (status: ResidentStatusFilter) => update({ status: query.status === status ? 'all' : status })

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tiles: Array<{ label: string; value: string; status?: ResidentStatusFilter }> = [
    { label: 'Active', value: String(summary.active), status: 'active' },
    { label: 'Inactive', value: String(summary.inactive), status: 'inactive' },
    { label: 'Awaiting sign-in', value: String(summary.awaiting), status: 'awaiting' },
    { label: 'Rent overdue', value: String(summary.rentOverdue), status: 'rent-overdue' },
    { label: 'Pending verification', value: String(summary.pendingVerification), status: 'verification' },
    { label: 'Average stay', value: summary.averageDaysStayed === null ? '—' : `${summary.averageDaysStayed} ${summary.averageDaysStayed === 1 ? 'day' : 'days'}` },
  ]

  function renderList() {
    if (loadState === 'loading') {
      return <div className="resident-list" aria-busy="true" aria-label="Loading residents">{Array.from({ length: placeholderRows }, (_, index) => <div className="resident-skeleton" key={index}><span className="skeleton-circle" /><span className="skeleton-lines"><span /><span /></span><span className="skeleton-pill" /></div>)}</div>
    }
    if (loadState === 'error') {
      return <div className="workspace-empty"><div className="workspace-empty-icon"><RotateCw size={22} /></div><h3>Residents could not be loaded</h3><p>Check your connection and try again.</p><button className="primary-button" onClick={onRetry}><RotateCw size={16} /> Retry</button></div>
    }
    if (!residents.length) {
      return <div className="workspace-empty"><div className="workspace-empty-icon"><Users size={22} /></div><h3>No residents yet</h3><p>Add a resident and assign them to an available room.</p><button className="primary-button" onClick={onAdd}><UserPlus size={16} /> Add first resident</button></div>
    }
    if (!visibleResidents.length) {
      return <div className="workspace-empty"><div className="workspace-empty-icon"><Search size={22} /></div><h3>No residents match</h3><p>Try a different search or clear the filters.</p><button className="secondary-button" onClick={() => setQuery(defaultResidentQuery)}>Clear filters</button></div>
    }
    return <><div className="resident-list">{pager.pageItems.map((resident, index) => <ResidentRow key={resident.id} resident={resident} index={index} doorKeysEnabled={doorKeysEnabled} isExpanded={expandedIds.has(resident.id)} onToggle={() => toggleExpanded(resident.id)} onEdit={() => onEdit(resident)} onClone={() => onClone(resident)} onDelete={() => onDelete(resident)} onVerify={(decision) => onVerify(resident, decision)} onRecordRent={(month) => onRecordRent(resident, month)} onUndoRent={(paymentId) => onUndoRent(resident, paymentId)} onChanged={onChanged} onNotice={onNotice} securityDeposit={securityDeposit} />)}</div><Pagination state={pager} label="Residents" /></>
  }

  return (
    <section className="workspace-view residents-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Workspace module</p><h2>Residents</h2><p>Everyone living across your properties.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button><button className="secondary-button" onClick={onInvite}><Send size={15} /> Send registration link</button><button className="primary-button" onClick={onAdd}><UserPlus size={16} /> Add resident</button></div></div>
      <div className="workspace-summary residents-summary">
        {tiles.map((tile, index) => tile.status
          ? <button key={tile.label} type="button" className={`summary-tile${query.status === tile.status ? ' is-selected' : ''}`} style={{ '--stagger': index } as React.CSSProperties} aria-pressed={query.status === tile.status} onClick={() => toggleStatus(tile.status!)}><span>{tile.label}</span><strong>{loadState === 'ready' ? tile.value : '–'}</strong></button>
          : <div key={tile.label} className="summary-tile" style={{ '--stagger': index } as React.CSSProperties}><span>{tile.label}</span><strong>{loadState === 'ready' ? tile.value : '–'}</strong></div>)}
      </div>
      {loadState === 'ready' && residents.length > 0 && <>
        <div className="residents-toolbar">
          <label className="toolbar-search"><Search size={14} /><input type="search" value={query.search} onChange={(event) => update({ search: event.target.value })} placeholder="Search name, phone, email or room" aria-label="Search residents" /></label>
          <select aria-label="Filter by property" value={query.propertyId} onChange={(event) => update({ propertyId: event.target.value })}><option value="all">All properties</option>{propertyOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <select aria-label="Filter by status" value={query.status} onChange={(event) => update({ status: event.target.value as ResidentStatusFilter })}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="Sort residents" value={query.sort} onChange={(event) => update({ sort: event.target.value as ResidentSort })}>{sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        <p className="residents-count" aria-live="polite">Showing {visibleResidents.length} of {residents.length} {residents.length === 1 ? 'resident' : 'residents'}{isFiltered && <> · <button type="button" className="text-link" onClick={() => setQuery({ ...defaultResidentQuery, sort: query.sort })}>Clear filters</button></>}</p>
      </>}
      {renderList()}
    </section>
  )
}
