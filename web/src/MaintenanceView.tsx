import { useEffect, useMemo, useState } from 'react'
import { Wrench } from 'lucide-react'
import { formatWhen, maintenanceCategoryLabels, maintenanceStatusLabels, maintenanceStatusTones, type MaintenanceStatus, type OwnerMaintenanceRequest } from './maintenance'
import { readApiError } from './superAdmin'

type Filter = 'active' | MaintenanceStatus | 'all'
const filters: Array<[Filter, string]> = [['active', 'Open & in progress'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['all', 'All']]

/** One request: details, photo link, the owner's reply box, and the status buttons. */
function MaintenanceItem({ request, onUpdate }: { request: OwnerMaintenanceRequest; onUpdate: (id: string, change: { status?: MaintenanceStatus; ownerNote?: string }) => Promise<string | null> }) {
  const [note, setNote] = useState(request.ownerNote ?? '')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  async function save(change: { status?: MaintenanceStatus; ownerNote?: string }) {
    setIsSaving(true)
    setError((await onUpdate(request.id, change)) ?? '')
    setIsSaving(false)
  }
  return (
    <div className="maintenance-item">
      <div className="maintenance-item-head">
        <div>
          <strong>{request.title} <span className="maintenance-category">{maintenanceCategoryLabels[request.category] ?? request.category}</span></strong>
          <small>{request.resident ? `${request.resident.name}${request.resident.room ? ` · room ${request.resident.room}` : ''}` : 'Former resident'} · {request.property} · {formatWhen(request.createdAt)}{request.hasPhoto && <> · <a href={`/api/maintenance/${request.id}/photo`} target="_blank" rel="noreferrer">View photo</a></>}</small>
          {request.details && <p>{request.details}</p>}
        </div>
        <span className={`status-pill ${maintenanceStatusTones[request.status]}`}>{maintenanceStatusLabels[request.status]}</span>
      </div>
      <div className="maintenance-item-actions">
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Reply to the resident (optional), e.g. Electrician coming tomorrow 10 am" aria-label="Reply to the resident" />
        <button type="button" className="secondary-button" disabled={isSaving || note === (request.ownerNote ?? '')} onClick={() => void save({ ownerNote: note })}>Send reply</button>
        {request.status === 'open' && <button type="button" className="secondary-button" disabled={isSaving} onClick={() => void save({ status: 'in_progress', ownerNote: note })}>Start work</button>}
        {request.status !== 'resolved' ? <button type="button" className="primary-button" disabled={isSaving} onClick={() => void save({ status: 'resolved', ownerNote: note })}>Mark resolved</button>
          : <button type="button" className="secondary-button" disabled={isSaving} onClick={() => void save({ status: 'open' })}>Reopen</button>}
      </div>
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  )
}

/**
 * The owner's Maintenance page: residents' complaints and repair requests, filtered by status, with a
 * reply and Start work / Mark resolved / Reopen on each. Every change emails the resident.
 */
export function MaintenanceView({ onBack, onNotice, onChanged }: { onBack: () => void; onNotice: (message: string) => void; onChanged: () => void }) {
  const [requests, setRequests] = useState<OwnerMaintenanceRequest[] | null>(null)
  const [filter, setFilter] = useState<Filter>('active')
  const [loadError, setLoadError] = useState('')

  function load() {
    fetch('/api/maintenance').then(async (response) => {
      if (!response.ok) { setLoadError(await readApiError(response, 'Could not load maintenance requests.')); return }
      setRequests(await response.json() as OwnerMaintenanceRequest[])
    }, () => setLoadError('Could not reach the server.'))
  }
  useEffect(load, [])

  const visible = useMemo(() => (requests ?? []).filter((request) => filter === 'all' || (filter === 'active' ? request.status !== 'resolved' : request.status === filter)), [requests, filter])
  const count = (key: Filter) => (requests ?? []).filter((request) => key === 'all' || (key === 'active' ? request.status !== 'resolved' : request.status === key)).length

  async function update(id: string, change: { status?: MaintenanceStatus; ownerNote?: string }) {
    const response = await fetch(`/api/maintenance/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) }).catch(() => null)
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not update the request.')
    onNotice(change.status ? `Marked ${maintenanceStatusLabels[change.status].toLowerCase()}; the resident has been emailed.` : 'Reply sent to the resident.')
    load()
    onChanged()
    return null
  }

  return (
    <section className="workspace-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Maintenance</h2><p>Complaints and repair requests from residents.</p></div><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div>
      <div className="booking-source-chips" role="group" aria-label="Filter by status">{filters.map(([key, label]) => <button key={key} type="button" className={`booking-chip${filter === key ? ' is-selected' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<b>{count(key)}</b></button>)}</div>
      {loadError ? <p className="login-error" role="alert">{loadError}</p> : requests === null ? <p className="portal-empty">Loading…</p> : visible.length
        ? <div className="maintenance-list">{visible.map((request) => <MaintenanceItem key={request.id} request={request} onUpdate={update} />)}</div>
        : <div className="workspace-empty"><div className="workspace-empty-icon"><Wrench size={22} /></div><h3>{requests.length ? 'Nothing here' : 'No requests yet'}</h3><p>{requests.length ? 'Try another filter.' : 'When residents report a problem from their portal, it appears here.'}</p></div>}
    </section>
  )
}
