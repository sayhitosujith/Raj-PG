import { useState } from 'react'
import { Phone, Plus, Users, X } from 'lucide-react'
import { readApiError } from './superAdmin'
import { workerRoles, type Worker, type WorkerRole } from './workers'

type StaffProperty = { id: string; name: string; workers: Worker[] }

/**
 * The people who work at each property, grouped by role. Super admins add (name, role, optional phone)
 * and remove them; receptionists see the same list read-only, since the API refuses their changes.
 * Residents see only the housekeeping names, in their Housekeeping card.
 */
export function StaffPanel({ properties, canManage, onChanged, onNotice }: { properties: StaffProperty[]; canManage: boolean; onChanged: (propertyId: string, workers: Worker[]) => void; onNotice: (message: string) => void }) {
  const [chosenId, setChosenId] = useState(properties[0]?.id ?? '')
  const [name, setName] = useState('')
  const [role, setRole] = useState<WorkerRole>('HOUSEKEEPING')
  const [phone, setPhone] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const property = properties.find((item) => item.id === chosenId) ?? properties[0]
  if (!property) return null
  const { workers } = property
  const groups = workerRoles.map((option) => ({ ...option, workers: workers.filter((worker) => worker.role === option.value) })).filter((group) => group.workers.length)

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    setIsSaving(true)
    const response = await fetch(`/api/properties/${property.id}/workers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, role, phone }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Staff member could not be added.') : 'Could not reach the server.'); return }
    const added = await response.json() as Worker
    onChanged(property.id, [...workers, added])
    onNotice(`${added.name} added as ${workerRoles.find((option) => option.value === added.role)?.label.toLowerCase()}.`)
    setName('')
    setPhone('')
  }

  async function remove(worker: Worker) {
    setIsSaving(true)
    const response = await fetch(`/api/properties/${property.id}/workers/${worker.id}`, { method: 'DELETE' }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Staff member could not be removed.') : 'Could not reach the server.'); return }
    onChanged(property.id, workers.filter((item) => item.id !== worker.id))
    onNotice(`${worker.name} removed.`)
  }

  return (
    <div className="staff-panel">
      <div className="staff-panel-head">
        <span className="staff-panel-icon"><Users size={17} /></span>
        <div><strong>Staff{properties.length > 1 ? '' : ` · ${property.name}`}</strong><small>{workers.length ? `${workers.length} ${workers.length === 1 ? 'person' : 'people'}; residents see the housekeeping names` : canManage ? 'Add the people who work here; residents see the housekeeping names' : 'No staff added yet'}</small></div>
        {properties.length > 1 && <select aria-label="Property" value={property.id} onChange={(event) => setChosenId(event.target.value)}>{properties.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.workers.length})</option>)}</select>}
      </div>
      {groups.map((group) => (
        <div key={group.value} className="staff-panel-group">
          <span className="staff-panel-role">{group.label}</span>
          <div className="staff-panel-list">
            {group.workers.map((worker) => (
              <span key={worker.id} className="staff-chip">
                {worker.name}
                {worker.phone && <a href={`tel:${worker.phone}`} className="staff-chip-phone" aria-label={`Call ${worker.name}`}><Phone size={11} />{worker.phone}</a>}
                {canManage && <button type="button" aria-label={`Remove ${worker.name}`} disabled={isSaving} onClick={() => void remove(worker)}><X size={12} /></button>}
              </span>
            ))}
          </div>
        </div>
      ))}
      {canManage && (
        <form className="staff-panel-form" onSubmit={add}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Name" aria-label="Staff name" />
          <select value={role} onChange={(event) => setRole(event.target.value as WorkerRole)} aria-label="Role">{workerRoles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" inputMode="tel" maxLength={20} placeholder="Phone (optional)" aria-label="Phone" />
          <button type="submit" className="icon-button" aria-label="Add staff member" disabled={isSaving || !name.trim()}><Plus size={15} /></button>
        </form>
      )}
    </div>
  )
}
