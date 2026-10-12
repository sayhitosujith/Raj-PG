import { useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { formatAadhar } from './aadharNumber'
import { PhoneField } from './PhoneField'
import { EmergencyContactFields, emergencyContactFields, type EmergencyContact } from './EmergencyContact'
import { VehicleFields, vehicleFields, type Vehicle } from './VehicleFields'
import { readApiError } from './superAdmin'
import { ModalLayer } from './ModalLayer'

/** The resident's own details as the editor needs them. */
export type EditableDetails = EmergencyContact & Vehicle & { name: string; occupation?: string | null; phone?: string | null; email?: string | null; permanentAddress?: string | null; isIndian: boolean; documentNumber?: string | null }

/**
 * "Edit" beside the resident's "My details" heading: a modal to change their name, phone, email,
 * occupation, permanent address, emergency contact and vehicle, saved straight away. Their ID document is changed
 * separately, through the existing ID form, because a new document needs the owner's review first.
 */
export function MyDetailsEditor({ details, onChanged, onNotice }: { details: EditableDetails; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const documentName = details.isIndian ? 'Aadhaar' : 'passport'

  function close() { setIsOpen(false); setError('') }

  async function send(request: () => Promise<Response>, fallback: string, success: string) {
    setIsSaving(true)
    setError('')
    try {
      const response = await request()
      if (!response.ok) { setError(await readApiError(response, fallback)); return }
      close()
      onNotice(success)
      await onChanged()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(['name', 'phone', 'email', 'occupation', 'permanentAddress', ...emergencyContactFields, ...vehicleFields].map((field) => [field, String(form.get(field) ?? '')]))
    void send(() => fetch('/api/resident-portal/details', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), 'Could not save your details.', 'Your details are saved.')
  }

  function changeDocument() {
    if (!window.confirm(`Change your ${documentName}? You'll enter the new details and upload a photo of it, and most of your portal stays locked until your property owner approves it.`)) return
    void send(() => fetch('/api/resident-portal/identity/change', { method: 'POST' }), `Could not reopen your ${documentName}.`, `Enter your new ${documentName} details.`)
  }

  return (
    <>
      <button type="button" className="secondary-button my-details-edit" onClick={() => setIsOpen(true)}><Pencil size={14} /> Edit</button>
      {isOpen && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
        <form className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="my-details-title" onSubmit={save}>
          <div className="modal-heading"><div><p className="eyebrow">Resident</p><h2 id="my-details-title">Edit my details</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={close}><X size={18} /></button></div>
          <label>Name<input name="name" required maxLength={80} defaultValue={details.name} autoComplete="name" /></label>
          <PhoneField name="phone" label="Phone" defaultValue={details.phone ?? ''} />
          <label>Email <span>(optional)</span><input name="email" type="email" maxLength={120} defaultValue={details.email ?? ''} autoComplete="email" /></label>
          <label>Occupation <span>(optional)</span><input name="occupation" maxLength={60} defaultValue={details.occupation ?? ''} placeholder="e.g. Software engineer, Student" autoComplete="organization-title" /></label>
          <label>Permanent address<textarea name="permanentAddress" rows={3} maxLength={300} defaultValue={details.permanentAddress ?? ''} /></label>
          <EmergencyContactFields contact={details} />
          <VehicleFields vehicle={details} />
          <p className="my-details-note">Your phone or email is how you sign in. A new address shows as unverified until your property owner checks it.</p>
          <div className="my-details-document">
            <div><strong>{details.isIndian ? 'Aadhaar number' : 'Passport number'}</strong><small>{details.documentNumber ? (details.isIndian ? formatAadhar(details.documentNumber) : details.documentNumber) : 'Not on file'}</small></div>
            <button type="button" className="secondary-button" disabled={isSaving} onClick={changeDocument}>Change {documentName}</button>
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save details'}</button></div>
        </form>
      </div></ModalLayer>}
    </>
  )
}
