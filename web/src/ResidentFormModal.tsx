import { useEffect, useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, Save, UserPlus, X } from 'lucide-react'
import { copyWithNotice } from './clipboard'
import { readIdentityFields, type DocumentUploads } from './identity'
import { IdentityDocumentFields } from './IdentityDocumentFields'
import { todayDateInputValue } from './joinDate'
import type { Resident } from './resident'
import { ResidentPhotoField, type PhotoChange } from './ResidentPhotoField'
import { PhoneField } from './PhoneField'
import { readApiError } from './superAdmin'
import { RoomSelect } from './RoomSelect'

const minimumPasswordLength = 10

// The server owns key generation so the format and randomness source live in one place.
async function fetchAccessKeyPreview() {
  const response = await fetch('/api/residents/access-key').catch(() => null)
  if (!response?.ok) return null
  return (await response.json() as { accessKey: string }).accessKey
}

/**
 * Add/edit form for a resident. One component serves both modes so the two can never drift apart;
 * `resident` switches it to edit mode.
 */
/** Starting values for a new resident, e.g. from a booking request being converted. */
export type ResidentPrefill = { name: string; phone: string; email: string | null; propertyId: string; foodOpted: boolean | null; joinedAt: string | null }

export function ResidentFormModal({ resident, prefill, properties, onClose, onSaved, onNotice }: { resident?: Resident; prefill?: ResidentPrefill; properties: Array<{ id?: string; name: string; rentWithFood?: number | null; rentWithoutFood?: number | null }>; onClose: () => void; onSaved: (resident: Resident) => void; onNotice: (message: string) => void }) {
  const isEdit = resident !== undefined
  const [accessKey, setAccessKey] = useState('')
  const [uploads, setUploads] = useState<DocumentUploads>({})
  const [photoChange, setPhotoChange] = useState<PhotoChange>(undefined)
  // Initials in the preview follow the name as it is typed.
  const [previewName, setPreviewName] = useState(resident?.name ?? prefill?.name ?? '')
  // Property and food plan decide the rent when the property sets prices, so both are tracked live.
  const [propertyId, setPropertyId] = useState(resident?.propertyId ?? prefill?.propertyId ?? '')
  const [foodOpted, setFoodOpted] = useState(resident?.foodOpted ?? prefill?.foodOpted ?? true)
  const selectedProperty = properties.find((property) => property.id === propertyId)
  const pricedRent = selectedProperty?.rentWithFood && selectedProperty.rentWithoutFood ? (foodOpted ? selectedProperty.rentWithFood : selectedProperty.rentWithoutFood) : null
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [portalPassword, setPortalPassword] = useState('')
  const [isPortalPasswordVisible, setIsPortalPasswordVisible] = useState(false)

  function applyPreview(key: string | null) {
    if (key) setAccessKey(key)
    else setError('Could not generate an access key.')
  }

  // New residents need a key before they can be saved; existing ones keep theirs unless reset.
  useEffect(() => {
    if (isEdit) return
    let isCurrent = true
    void fetchAccessKeyPreview().then((key) => { if (isCurrent) applyPreview(key) })
    return () => { isCurrent = false }
  }, [isEdit])

  async function previewAccessKey() {
    setAccessKey('')
    applyPreview(await fetchAccessKeyPreview())
  }

  async function resetAccessKey() {
    if (!resident || !window.confirm(`Issue a new access key for ${resident.name}? Their current key and any password they set stop working, and they are signed out. They will sign in with the new key and choose a new password.`)) return
    const response = await fetch(`/api/residents/${resident.id}/access-key`, { method: 'POST' })
    if (!response.ok) { setError(await readApiError(response, 'Could not reset the access key.')); return }
    setAccessKey((await response.json() as { accessKey: string }).accessKey)
    onNotice('New access key issued. Copy it now — it will not be shown again.')
  }

  // Saved immediately rather than with the form, like the access key reset, so the owner knows
  // the password is live before telling the resident.
  async function setResidentPassword() {
    if (!resident) return
    if (portalPassword.length < minimumPasswordLength) { setError(`Password must be at least ${minimumPasswordLength} characters.`); return }
    const response = await fetch(`/api/residents/${resident.id}/password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: portalPassword }) })
    if (!response.ok) { setError(await readApiError(response, 'Could not set the password.')); return }
    setError('')
    setAccessKey('')
    onNotice(`Password set. ${resident.name} can now sign in with it; their access key no longer works.`)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fields = Object.fromEntries(['name', 'propertyId', 'roomNumber', 'phone', 'email', 'permanentAddress', 'joinedAt', 'monthlyRent'].map((field) => [field, String(form.get(field) ?? '')]))
    // An untouched file input means "keep the current upload", so only chosen files are sent.
    const payload = { ...fields, ...readIdentityFields(form), ...uploads, ...(photoChange !== undefined ? { profilePhoto: photoChange } : {}), foodOpted, whatsappOptIn: form.get('whatsappOptIn') === 'on', emailOptIn: form.get('emailOptIn') === 'on', ...(isEdit ? { active: form.get('status') === 'active' } : { accessKey }) }
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(isEdit ? `/api/residents/${resident.id}` : '/api/residents', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) { setError(await readApiError(response, 'Could not save the resident.')); return }
      const { accessKey: savedKey, ...saved } = await response.json() as Resident & { accessKey?: string }
      onSaved(saved)
      onNotice(isEdit ? `${saved.name} updated.` : `Resident added with access key ${savedKey}.`)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="profile-modal resident-modal" onSubmit={save}>
        <div className="modal-heading"><div><p className="eyebrow">Residents</p><h2>{isEdit ? 'Edit resident' : 'Add resident'}</h2></div><button type="button" className="icon-button" aria-label="Close resident form" onClick={onClose}><X size={18} /></button></div>
        <ResidentPhotoField name={previewName} currentUrl={resident?.photoVersion ? `/api/residents/${resident.id}/photo?v=${resident.photoVersion}` : null} change={photoChange} onChange={setPhotoChange} onError={setError} />
        <label>Resident name<input name="name" required onChange={(event) => setPreviewName(event.target.value)} defaultValue={resident?.name ?? prefill?.name} placeholder="e.g. Ananya Sharma" /></label>
        <label>Property<select name="propertyId" required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="" disabled>Select property</option>{properties.filter((property) => property.id).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <PhoneField name="phone" label="Phone number" required={!isEdit} defaultValue={resident?.phone ?? prefill?.phone} />
        <label>Email address<input name="email" type="email" required={!isEdit} defaultValue={resident?.email ?? prefill?.email ?? ''} placeholder="e.g. resident@example.com" /></label>
        <label>Permanent address<textarea name="permanentAddress" required={!isEdit} defaultValue={resident?.permanentAddress ?? ''} placeholder="Full permanent address" /></label>
        <IdentityDocumentFields details={resident} currentDocumentUrls={resident && { aadharCard: `/api/residents/${resident.id}/aadhar-card`, passportScan: `/api/residents/${resident.id}/passport-scan` }} required={!isEdit} onUpload={(chosen) => setUploads((current) => ({ ...current, ...chosen }))} onError={setError} />
        <RoomSelect propertyId={propertyId} currentRoom={resident && propertyId === resident.propertyId ? resident.room : undefined} />
        <fieldset className="food-plan">
          <legend>Food plan</legend>
          <div className="food-plan-options">
            {([true, false] as const).map((option) => (
              <label key={String(option)} className={`food-plan-option${foodOpted === option ? ' is-selected' : ''}`}>
                <input type="radio" name="foodOpted" checked={foodOpted === option} onChange={() => setFoodOpted(option)} />
                <strong>{option ? 'With food' : 'Without food'}</strong>
                {selectedProperty?.rentWithFood && selectedProperty.rentWithoutFood ? <small>₹{(option ? selectedProperty.rentWithFood : selectedProperty.rentWithoutFood).toLocaleString('en-IN')} / month</small> : <small>{option ? 'Menu, skips and meal alerts' : 'No food features'}</small>}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="whatsapp-optin"><input type="checkbox" name="whatsappOptIn" defaultChecked={resident?.whatsappOptIn ?? true} /><span>WhatsApp updates <small>Rent reminders, receipts and notices on WhatsApp. The resident can turn this off in their portal.</small></span></label>
        <label className="whatsapp-optin"><input type="checkbox" name="emailOptIn" defaultChecked={resident?.emailOptIn ?? true} /><span>Email updates <small>Rent reminders and notices by email. Payment receipts are always emailed when there is an email address.</small></span></label>
        {pricedRent !== null
          ? <p className="priced-rent">Monthly rent <strong>₹{pricedRent.toLocaleString('en-IN')}</strong> <span>set by {selectedProperty?.name} for {foodOpted ? 'with food' : 'without food'}; change it in the property's prices</span></p>
          : <label>Monthly rent (₹) <span>(reminder days are set in Settings; leave blank to not track)</span><input name="monthlyRent" type="number" inputMode="numeric" min={0} max={1000000} step={1} defaultValue={resident?.rent.monthlyRent ?? undefined} placeholder="e.g. 8500" /></label>}
        <label>Joining date<input name="joinedAt" type="date" required defaultValue={resident ? resident.joinedAt.slice(0, 10) : prefill?.joinedAt?.slice(0, 10) ?? todayDateInputValue()} /></label>
        {isEdit && <label>Status<select name="status" defaultValue={resident.active ? 'active' : 'inactive'}><option value="active">Active</option><option value="inactive">Inactive — blocks app sign-in</option></select></label>}
        <div className="access-key-field">
          <label htmlFor="resident-access-key">Access key <span>{isEdit ? (accessKey ? '(new key — copy it now)' : '(stored securely; reset to issue a new one)') : '(share with the resident for portal login)'}</span></label>
          <div className="access-key-control">
            <input id="resident-access-key" value={accessKey} readOnly required={!isEdit} placeholder={isEdit ? '•••• ••••' : 'Generating…'} />
            <button type="button" className="icon-button" aria-label="Copy access key" title="Copy access key" disabled={!accessKey} onClick={() => copyWithNotice(accessKey, 'Access key', onNotice)}><Copy size={16} /></button>
            {isEdit
              ? <button type="button" className="icon-button" aria-label="Reset access key" title="Reset access key" onClick={resetAccessKey}><KeyRound size={16} /></button>
              : <button type="button" className="icon-button" aria-label="Generate a new access key" title="Generate a new access key" onClick={previewAccessKey}><RefreshCw size={16} /></button>}
          </div>
        </div>
        {isEdit && <div className="access-key-field">
          <label htmlFor="resident-portal-password">Portal password <span>(choose one to tell the resident; replaces their access key)</span></label>
          <div className="access-key-control">
            <input id="resident-portal-password" type={isPortalPasswordVisible ? 'text' : 'password'} value={portalPassword} onChange={(event) => setPortalPassword(event.target.value)} autoComplete="new-password" placeholder="At least 10 characters" />
            <button type="button" className="icon-button" aria-label={isPortalPasswordVisible ? 'Hide password' : 'Show password'} title={isPortalPasswordVisible ? 'Hide password' : 'Show password'} onClick={() => setIsPortalPasswordVisible((visible) => !visible)}>{isPortalPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            <button type="button" className="icon-button" aria-label="Set password" title="Set password" disabled={!portalPassword} onClick={setResidentPassword}><Check size={16} /></button>
          </div>
        </div>}
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving || (!isEdit && !accessKey)}>{isEdit ? <><Save size={16} /> Save changes</> : <><UserPlus size={17} /> Add resident</>}</button></div>
      </form>
    </div>
  )
}
