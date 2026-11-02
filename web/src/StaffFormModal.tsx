import { useState } from 'react'
import { X } from 'lucide-react'
import { ModalLayer } from './ModalLayer'
import { todayDateInputValue } from './joinDate'
import { PhoneField } from './PhoneField'
import { ResidentPhotoField, type PhotoChange } from './ResidentPhotoField'
import { readApiError } from './superAdmin'
import { workerPhotoUrl, workerRoles, type Worker, type WorkerRole } from './workers'

/**
 * Add or edit one property staff member: name, role, phone and date of joining (all required) and an
 * optional photo. New staff default to joining today; existing staff without a date start blank, so
 * "today" is never saved for them by accident.
 * Saves straight to the API and hands the saved worker back; errors stay in the form.
 */
export function StaffFormModal({ propertyId, propertyName, worker, onSaved, onClose }: { propertyId: string; propertyName: string; worker: Worker | null; onSaved: (worker: Worker) => void; onClose: () => void }) {
  const [name, setName] = useState(worker?.name ?? '')
  const [photoChange, setPhotoChange] = useState<PhotoChange>(undefined)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = { name, role: form.get('role') as WorkerRole, phone: String(form.get('phone') ?? ''), joinedOn: String(form.get('joinedOn') ?? ''), ...(photoChange !== undefined ? { photo: photoChange } : {}) }
    setIsSaving(true)
    setError('')
    const url = worker ? `/api/properties/${propertyId}/workers/${worker.id}` : `/api/properties/${propertyId}/workers`
    const response = await fetch(url, { method: worker ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { setError(response ? await readApiError(response, 'Staff member could not be saved.') : 'Could not reach the server.'); return }
    onSaved(await response.json() as Worker)
  }

  return (
    <ModalLayer>
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <form className="profile-modal" onSubmit={save}>
          <div className="modal-heading"><div><p className="eyebrow">Staff · {propertyName}</p><h2>{worker ? `Edit ${worker.name}` : 'Add staff member'}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
          <ResidentPhotoField name={name} currentUrl={worker ? workerPhotoUrl(propertyId, worker) : null} change={photoChange} onChange={setPhotoChange} subject="staff member" />
          <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} autoComplete="off" /></label>
          <label>Role<select name="role" defaultValue={worker?.role ?? 'HOUSEKEEPING'}>{workerRoles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <PhoneField name="phone" label="Phone number" required defaultValue={worker?.phone} />
          <label>Date of joining<input name="joinedOn" type="date" required defaultValue={worker ? worker.joinedOn?.slice(0, 10) ?? '' : todayDateInputValue()} /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving…' : worker ? 'Save changes' : 'Add staff member'}</button></div>
        </form>
      </div>
    </ModalLayer>
  )
}
