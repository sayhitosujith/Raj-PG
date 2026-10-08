import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'
import { InlineLoader } from './Loader'
import { Pagination } from './Pagination'
import { useRefreshSignal } from './useAutoRefresh'
import { usePagination } from './usePagination'

/** One entry of the audit log, as GET /api/audit-logs lists it. */
type AuditEntry = { id: string; staffId: string; staffName: string; staffRole: 'SUPER_ADMIN' | 'RECEPTIONIST'; action: string; createdAt: string }

const periods = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['', 'All time']] as const

const sinceDate = (days: string) => {
  if (!days) return ''
  const date = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)
  return `?from=${date.toISOString().slice(0, 10)}`
}
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * "Audit logs" (super admins only): every change a staff member saved, newest first, with who made
 * it, their role and when. Filter by person, role or period, and search the wording. The server
 * records entries as changes succeed (see backend staffActivity.ts); this page only reads them.
 */
export function AuditLogsView({ refreshSignal, onBack }: { refreshSignal: number; onBack: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [period, setPeriod] = useState<string>('30')
  const [person, setPerson] = useState('')
  const [role, setRole] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(() => fetch(`/api/audit-logs${sinceDate(period)}`)
    .then((response) => response.ok ? response.json() as Promise<AuditEntry[]> : Promise.reject(new Error('Audit log request failed')))
    .then((list) => { setEntries(list); setLoadError(false) }, () => setLoadError(true)), [period])
  useEffect(() => { void load() }, [load])
  useRefreshSignal(refreshSignal, () => { void load() })

  const people = useMemo(() => [...new Map((entries ?? []).map((entry) => [entry.staffId, entry.staffName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [entries])
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase()
    return (entries ?? []).filter((entry) => (!person || entry.staffId === person) && (!role || entry.staffRole === role) && (!words || `${entry.action} ${entry.staffName}`.toLowerCase().includes(words)))
  }, [entries, person, role, query])
  const pager = usePagination(shown, 20, `${period}|${person}|${role}|${query}`)

  return (
    <section className="workspace-view audit-logs-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Audit logs</h2><p>Every change made by your team: who did what, and when.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>
      <div className="residents-toolbar">
        <label className="toolbar-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search changes or names" aria-label="Search the audit log" /></label>
        <select value={person} onChange={(event) => setPerson(event.target.value)} aria-label="Filter by person"><option value="">Everyone</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Filter by role"><option value="">All roles</option><option value="SUPER_ADMIN">Super admins</option><option value="RECEPTIONIST">Receptionists</option></select>
        <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Period">{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
      {loadError && !entries ? <p className="login-error" role="alert">The audit log could not be loaded.</p>
        : !entries ? <InlineLoader label="Loading the audit log…" />
        : !shown.length ? <div className="workspace-empty"><span className="workspace-empty-icon"><History size={20} /></span><h3>No changes found</h3><p>{entries.length ? 'Nothing matches these filters.' : 'Changes your team saves will appear here.'}</p></div>
        : <>
            <ol className="audit-log">
              {pager.pageItems.map((entry) => (
                <li key={entry.id}>
                  <div className="audit-log-main"><strong>{entry.action}</strong><small>{entry.staffName} · <span className={`audit-role is-${entry.staffRole.toLowerCase()}`}>{entry.staffRole === 'SUPER_ADMIN' ? 'Super admin' : 'Receptionist'}</span></small></div>
                  <time dateTime={entry.createdAt}>{when(entry.createdAt)}</time>
                </li>
              ))}
            </ol>
            <Pagination state={pager} label="audit entries" />
          </>}
    </section>
  )
}
