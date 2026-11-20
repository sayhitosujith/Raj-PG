import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { displayName } from './displayName'
import { propertyTimeZone, propertyToday } from './propertyTime'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'

type AttendanceStatus = 'PRESENT' | 'AWAY' | 'ON_LEAVE'
type RollCallResident = { id: string; name: string; room: string; bed: number | null; status: AttendanceStatus | null }
type RollCall = { date: string; today: string; saved: { by: string | null; at: string } | null; residents: RollCallResident[] }
type PropertyOption = { id: string; name: string }

const statusOptions: Array<[AttendanceStatus, string]> = [['PRESENT', 'Present'], ['AWAY', 'Away'], ['ON_LEAVE', 'On leave']]

const savedLabel = (saved: RollCall['saved']) => saved ? `Saved by ${saved.by ?? 'a team member'} at ${new Date(saved.at).toLocaleString('en-IN', { timeZone: propertyTimeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'

/** Present / Away / On leave for one resident, as a radio group of large buttons so a thumb can hit them. */
function StatusToggle({ name, value, onChange }: { name: string; value: AttendanceStatus; onChange: (status: AttendanceStatus) => void }) {
  return (
    <div className="attendance-toggle" role="radiogroup" aria-label={`${name}'s attendance`}>
      {statusOptions.map(([status, label]) => <button key={status} type="button" role="radio" aria-checked={value === status} className={`is-${status.toLowerCase().replace('_', '-')}${value === status ? ' is-selected' : ''}`} onClick={() => onChange(status)}>{label}</button>)}
    </div>
  )
}

/**
 * The nightly roll call: pick a property and night, mark each resident, save them all at once. Everyone
 * starts as Present unless the night was already saved. Choices not yet saved survive the background
 * refresh, so a live update from another screen never undoes what the staff member just tapped.
 */
export function AttendanceView({ properties: allProperties, refreshSignal, onBack, onNotice }: { properties: Array<{ id?: string; name: string }>; refreshSignal: number; onBack: () => void; onNotice: (message: string) => void }) {
  const properties = allProperties.filter((property): property is PropertyOption => Boolean(property.id))
  const [chosenId, setChosenId] = useState<string | null>(null)
  const propertyId = properties.some((property) => property.id === chosenId) ? chosenId! : properties[0]?.id
  const [date, setDate] = useState(() => propertyToday())
  const [rollCall, setRollCall] = useState<{ key: string; data: RollCall } | null>(null)
  // Tapped but not yet saved, for one property and night only, so switching either starts afresh.
  const [draft, setDraft] = useState<{ key: string; marks: Record<string, AttendanceStatus> }>({ key: '', marks: {} })
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const key = `${propertyId}|${date}`

  const load = useCallback((id: string, night: string) => {
    fetch(`/api/attendance?${new URLSearchParams({ propertyId: id, date: night })}`).then(async (response) => {
      if (!response.ok) { setLoadError(await readApiError(response, 'Could not load the roll call.')); return }
      setLoadError('')
      setRollCall({ key: `${id}|${night}`, data: await response.json() as RollCall })
    }, () => setLoadError('Could not reach the server.'))
  }, [])

  useEffect(() => { if (propertyId) load(propertyId, date) }, [propertyId, date, load])
  useRefreshSignal(refreshSignal, () => { if (propertyId) load(propertyId, date) })

  const data = rollCall?.key === key ? rollCall.data : null
  const changes = draft.key === key ? draft.marks : {}
  const statusOf = (resident: RollCallResident) => changes[resident.id] ?? resident.status ?? 'PRESENT'
  const counts = statusOptions.map(([status, label]) => `${data?.residents.filter((resident) => statusOf(resident) === status).length ?? 0} ${label.toLowerCase()}`).join(' · ')
  const hasChanges = Object.keys(changes).length > 0

  async function save() {
    if (!data || !propertyId) return
    setIsSaving(true)
    const marks = data.residents.map((resident) => ({ residentId: resident.id, status: statusOf(resident) }))
    const response = await fetch('/api/attendance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, date, marks }) }).catch(() => null)
    setIsSaving(false)
    if (!response) { onNotice('Could not reach the server. The roll call was not saved.'); return }
    if (!response.ok) { onNotice(await readApiError(response, 'The roll call could not be saved.')); return }
    setRollCall({ key, data: await response.json() as RollCall })
    setDraft({ key: '', marks: {} })
    onNotice(`Roll call saved for ${marks.length} ${marks.length === 1 ? 'resident' : 'residents'}.`)
  }

  return (
    <section className="workspace-view attendance-view">
      <div className="workspace-view-heading">
        <div><p className="eyebrow">Manage</p><h2>Attendance</h2><p>Each night, mark who is in. Emergency contacts get the week by email on Sunday.</p></div>
        <div className="view-actions">
          {properties.length === 1 && <span className="food-property-select is-single" title="Property">{properties[0].name}</span>}
          {properties.length > 1 && <select className="food-property-select" value={propertyId} aria-label="Property" onChange={(event) => setChosenId(event.target.value)}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>}
          <input className="food-property-select" type="date" aria-label="Night" value={date} max={data?.today ?? propertyToday()} onChange={(event) => { if (event.target.value) setDate(event.target.value) }} />
          <button className="secondary-button" onClick={onBack}>Back to dashboard</button>
        </div>
      </div>

      {!propertyId ? <div className="workspace-empty"><div className="workspace-empty-icon"><ClipboardCheck size={20} /></div><h3>No properties yet</h3><p>Add a property first, then take its roll call here.</p></div>
        : loadError && !data ? <p className="login-error" role="alert">{loadError}</p>
        : !data ? <p className="portal-empty">Loading…</p>
        : !data.residents.length ? <div className="workspace-empty"><div className="workspace-empty-icon"><ClipboardCheck size={20} /></div><h3>Nobody to mark</h3><p>Residents appear here once they are approved and have a room.</p></div>
        : <>
          <div className="attendance-summary"><span className={data.saved ? 'is-saved' : 'is-unsaved'}>{savedLabel(data.saved)}{hasChanges && data.saved ? ' · unsaved changes' : ''}</span><small>{counts}</small></div>
          <ul className="attendance-list">{data.residents.map((resident) => (
            <li key={resident.id}>
              <div><strong>{displayName(resident.name)}</strong><small>Room {resident.room || '—'}{resident.bed ? ` · Bed ${resident.bed}` : ''}</small></div>
              <StatusToggle name={displayName(resident.name)} value={statusOf(resident)} onChange={(status) => setDraft({ key, marks: { ...changes, [resident.id]: status } })} />
            </li>
          ))}</ul>
          <div className="attendance-actions"><button type="button" className="primary-button" disabled={isSaving} onClick={() => void save()}>{isSaving ? 'Saving…' : 'Save roll call'}</button></div>
        </>}
    </section>
  )
}
