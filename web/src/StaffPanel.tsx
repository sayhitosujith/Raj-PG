import { useState } from 'react'
import { Pencil, Phone, Plus, Trash2, Users } from 'lucide-react'
import { Avatar } from './Avatar'
import { ModalLayer } from './ModalLayer'
import { StaffFormModal } from './StaffFormModal'
import { readApiError } from './superAdmin'
import { workerPhotoUrl, workerRoles, type Worker } from './workers'

type StaffProperty = { id: string; name: string; workers: Worker[] }

/**
 * The people who work at each property, grouped by role, with photo and phone. Super admins add,
 * edit and remove them; receptionists see the same cards read-only, since the API refuses their
 * changes. Residents see only the housekeeping names, in their Housekeeping card.
 */
export function StaffPanel({ properties, canManage, onChanged, onNotice }: { properties: StaffProperty[]; canManage: boolean; onChanged: (propertyId: string, workers: Worker[]) => void; onNotice: (message: string) => void }) {
  const [chosenId, setChosenId] = useState(properties[0]?.id ?? '')
  // null: the add form; a worker: their edit form; undefined: no form open.
  const [editing, setEditing] = useState<Worker | null | undefined>(undefined)
  const [removing, setRemoving] = useState<Worker | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const property = properties.find((item) => item.id === chosenId) ?? properties[0]
  if (!property) return null
  const { workers } = property
  const groups = workerRoles.map((option) => ({ ...option, workers: workers.filter((worker) => worker.role === option.value) })).filter((group) => group.workers.length)

  function saved(worker: Worker) {
    const isNew = !workers.some((item) => item.id === worker.id)
    onChanged(property.id, isNew ? [...workers, worker] : workers.map((item) => item.id === worker.id ? worker : item))
    onNotice(isNew ? `${worker.name} added to staff.` : `${worker.name} updated.`)
    setEditing(undefined)
  }

  async function remove(worker: Worker) {
    setIsRemoving(true)
    const response = await fetch(`/api/properties/${property.id}/workers/${worker.id}`, { method: 'DELETE' }).catch(() => null)
    setIsRemoving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Staff member could not be removed.') : 'Could not reach the server.'); return }
    onChanged(property.id, workers.filter((item) => item.id !== worker.id))
    onNotice(`${worker.name} removed from staff.`)
    setRemoving(null)
  }

  return (
    <div className="staff-panel">
      <div className="staff-panel-head">
        <span className="staff-panel-icon"><Users size={17} /></span>
        <div><strong>Staff{properties.length > 1 ? '' : ` · ${property.name}`}</strong><small>{workers.length ? `${workers.length} ${workers.length === 1 ? 'person' : 'people'}; residents see the housekeeping names` : canManage ? 'Add the people who work here; residents see the housekeeping names' : 'No staff added yet'}</small></div>
        {properties.length > 1 && <select aria-label="Property" value={property.id} onChange={(event) => setChosenId(event.target.value)}>{properties.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.workers.length})</option>)}</select>}
        {canManage && <button type="button" className="primary-button" onClick={() => setEditing(null)}><Plus size={15} /> Add staff</button>}
      </div>
      {groups.map((group) => (
        <section key={group.value} className="staff-panel-group" aria-label={group.label}>
          <h3 className="staff-panel-role">{group.label} <span>{group.workers.length}</span></h3>
          <div className="staff-panel-cards">
            {group.workers.map((worker) => (
              <article key={worker.id} className="staff-card">
                <Avatar name={worker.name} photoUrl={workerPhotoUrl(property.id, worker)} className="staff-card-photo" />
                <div className="staff-card-text">
                  <strong>{worker.name}</strong>
                  {worker.phone ? <a href={`tel:${worker.phone}`}><Phone size={11} /> {worker.phone}</a> : <small>{canManage ? 'No phone yet; edit to add it' : 'No phone'}</small>}
                </div>
                {canManage && <div className="staff-card-actions">
                  <button type="button" className="icon-button" aria-label={`Edit ${worker.name}`} title="Edit" onClick={() => setEditing(worker)}><Pencil size={14} /></button>
                  <button type="button" className="icon-button" aria-label={`Remove ${worker.name}`} title="Remove" onClick={() => setRemoving(worker)}><Trash2 size={14} /></button>
                </div>}
              </article>
            ))}
          </div>
        </section>
      ))}
      {editing !== undefined && <StaffFormModal propertyId={property.id} propertyName={property.name} worker={editing} onSaved={saved} onClose={() => setEditing(undefined)} />}
      {removing && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRemoving(null)}><div className="confirm-modal" role="alertdialog" aria-labelledby="remove-staff-title"><div className="confirm-icon"><Trash2 size={22} /></div><h2 id="remove-staff-title">Remove {removing.name}?</h2><p>They will no longer be listed as {workerRoles.find((option) => option.value === removing.role)?.label.toLowerCase()} at {property.name}.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRemoving(null)}>Cancel</button><button type="button" className="danger-button" disabled={isRemoving} onClick={() => void remove(removing)}>{isRemoving ? 'Removing…' : 'Remove'}</button></div></div></div></ModalLayer>}
    </div>
  )
}
