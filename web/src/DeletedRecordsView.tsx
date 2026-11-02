import { useCallback, useEffect, useState } from 'react'
import { Archive } from 'lucide-react'
import type { Resident } from './resident'
import type { RentSummary } from './rent'
import { ResidentRow } from './ResidentRow'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'
import { InlineLoader } from './Loader'

async function fetchDeletedRecords() {
  const response = await fetch('/api/residents/deleted')
  if (!response.ok) throw new Error('Deleted records request failed')
  return await response.json() as Resident[]
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * "Deleted records": accounts closed at the resident's request, kept with every detail (contact, ID,
 * address, emergency contact, rent history) for the owner's records. Rows are the residents list's
 * rows in record mode, so nothing here acts on them as residents; the owner can still record or undo
 * rent (to settle dues) and delete a record permanently.
 */
export function DeletedRecordsView({ refreshSignal, securityDeposit, onBack, onNotice }: { refreshSignal: number; securityDeposit: number | null; onBack: () => void; onNotice: (message: string) => void }) {
  const [records, setRecords] = useState<Resident[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(() => fetchDeletedRecords().then((list) => { setRecords(list); setLoadError(false) }, () => setLoadError(true)), [])
  useEffect(() => { void load() }, [load])
  useRefreshSignal(refreshSignal, () => { void load() })

  function toggle(id: string) {
    setExpandedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  // Rent routes answer with the fresh summary, merged in so the row updates in place.
  async function changeRent(record: Resident, request: Promise<Response | null>, success: string) {
    const response = await request
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not update the rent.')
    const rent = await response.json() as RentSummary
    setRecords((current) => current?.map((item) => item.id === record.id ? { ...item, rent } : item) ?? current)
    onNotice(success)
    return null
  }

  async function deletePermanently(record: Resident) {
    if (!window.confirm(`Delete ${record.name}'s record permanently? Their details, documents and rent history are removed for good. This cannot be undone.`)) return
    const response = await fetch(`/api/residents/${record.id}/record`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) { onNotice('Could not delete the record.'); return }
    setRecords((current) => current?.filter((item) => item.id !== record.id) ?? current)
    onNotice(`${record.name}'s record was deleted permanently.`)
  }

  return (
    <section className="workspace-view residents-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Workspace module</p><h2>Deleted records</h2><p>Residents your team removed, and accounts closed at the resident's request, kept with their full details.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div></div>
      {!records
        ? (loadError ? <div className="workspace-empty"><h3>Deleted records could not be loaded</h3><p>Check your connection and try again.</p><button className="primary-button" onClick={() => void load()}>Retry</button></div> : <InlineLoader label="Loading deleted records…" />)
        : !records.length
          ? <div className="workspace-empty"><div className="workspace-empty-icon"><Archive size={22} /></div><h3>No deleted records</h3><p>When you remove a resident, or approve a resident's request to delete their account, it moves here.</p></div>
          : <div className="resident-list">{records.map((record, index) => (
              <div key={record.id} className="deleted-record">
                {record.deletedAt && <small className="deleted-record-date">Closed on {shortDate(record.deletedAt)}</small>}
                <ResidentRow isRecord resident={record} index={index} isExpanded={expandedIds.has(record.id)} onToggle={() => toggle(record.id)} onEdit={() => undefined} onClone={() => undefined} onDelete={() => void deletePermanently(record)} onVerify={async () => null} onRecordRent={(month) => changeRent(record, fetch(`/api/residents/${record.id}/rent-payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) }).catch(() => null), 'Rent recorded.')} onUndoRent={(paymentId) => changeRent(record, fetch(`/api/residents/${record.id}/rent-payments/${paymentId}`, { method: 'DELETE' }).catch(() => null), 'Payment removed.')} onChanged={() => void load()} onNotice={onNotice} securityDeposit={securityDeposit} />
              </div>
            ))}</div>}
    </section>
  )
}
