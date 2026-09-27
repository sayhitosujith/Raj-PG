import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, RefreshCw, Save, UserPlus, X } from 'lucide-react'
import { aadharCardAccept, readAadharCard } from './aadharCard'
import { copyWithNotice } from './clipboard'
import { todayDateInputValue } from './joinDate'
import type { Resident } from './resident'
import { ResidentPhotoField, type PhotoChange } from './ResidentPhotoField'
import { readApiError } from './superAdmin'
import { RoomSelect } from './RoomSelect'

const minimumPasswordLength = 10

// Older records may hold "+91…"; the form edits the 10-digit number the server now stores.
const tenDigitPhone = (phone: string | null | undefined) => phone ? phone.replace(/\D/g, '').slice(-10) : ''

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
export function ResidentFormModal({ resident, properties, onClose, onSaved, onNotice }: { resident?: Resident; properties: Array<{ id?: string; name: string; rentWithFood?: number | null; rentWithoutFood?: number | null }>; onClose: () => void; onSaved: (resident: Resident) => void; onNotice: (message: string) => void }) {
  const isEdit = resident !== undefined
  const [accessKey, setAccessKey] = useState('')
  const [aadharCard, setAadharCard] = useState('')
  const [photoChange, setPhotoChange] = useState<PhotoChange>(undefined)
  // Initials in the preview follow the name as it is typed.
  const [previewName, setPreviewName] = useState(resident?.name ?? '')
  // Property and food plan decide the rent when the property sets prices, so both are tracked live.
  const [propertyId, setPropertyId] = useState(resident?.propertyId ?? '')
  const [foodOpted, setFoodOpted] = useState(resident?.foodOpted ?? true)
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

  async function chooseAadharCard(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) { setAadharCard(''); return }
    const result = await readAadharCard(file)
    if ('error' in result) { setError(result.error); input.value = ''; return }
    setError('')
    setAadharCard(result.dataUrl)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fields = Object.fromEntries(['name', 'propertyId', 'roomNumber', 'phone', 'email', 'aadharNumber', 'permanentAddress', 'joinedAt', 'monthlyRent'].map((field) => [field, String(form.get(field) ?? '')]))
    // An untouched file input means "keep the current card", so the field is only sent when replaced.
    const payload = { ...fields, ...(photoChange !== undefined ? { profilePhoto: photoChange } : {}), ...(aadharCard ? { aadharCardUrl: aadharCard } : {}), foodOpted, ...(isEdit ? { active: form.get('status') === 'active' } : { accessKey }) }
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
        <label>Resident name<input name="name" required onChange={(event) => setPreviewName(event.target.value)} defaultValue={resident?.name} placeholder="e.g. Ananya Sharma" /></label>
        <label>Property<select name="propertyId" required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="" disabled>Select property</option>{properties.filter((property) => property.id).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label>Phone number <span>(10 digits)</span><input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} title="Enter the 10-digit mobile number" required={!isEdit} defaultValue={tenDigitPhone(resident?.phone)} placeholder="e.g. 9876543210" /></label>
        <label>Email address<input name="email" type="email" required={!isEdit} defaultValue={resident?.email ?? ''} placeholder="e.g. resident@example.com" /></label>
        <label>Aadhaar number <span>(12 digits)</span><input name="aadharNumber" inputMode="numeric" pattern="[0-9]{12}" maxLength={12} title="Enter the 12-digit Aadhaar number" required={!isEdit} defaultValue={resident?.aadharNumber ?? ''} placeholder="12-digit Aadhaar number" /></label>
        <label>Permanent address<textarea name="permanentAddress" required={!isEdit} defaultValue={resident?.permanentAddress ?? ''} placeholder="Full permanent address" /></label>
        <label className="aadhar-upload">Aadhaar card {isEdit && <span>{resident.hasAadharCard ? 'choose a file to replace the current one' : '(none on file)'}</span>}<input type="file" accept={aadharCardAccept} onChange={chooseAadharCard} /></label>
        {isEdit && resident.hasAadharCard && <a className="current-card-link" href={`/api/residents/${resident.id}/aadhar-card`} target="_blank" rel="noopener noreferrer">View current card <ExternalLink size={11} /></a>}
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
        {pricedRent !== null
          ? <p className="priced-rent">Monthly rent <strong>₹{pricedRent.toLocaleString('en-IN')}</strong> <span>set by {selectedProperty?.name} for {foodOpted ? 'with food' : 'without food'}; change it in the property's prices</span></p>
          : <label>Monthly rent (₹) <span>(reminder days are set in Settings; leave blank to not track)</span><input name="monthlyRent" type="number" inputMode="numeric" min={0} max={1000000} step={1} defaultValue={resident?.rent.monthlyRent ?? undefined} placeholder="e.g. 8500" /></label>}
        <label>Joining date<input name="joinedAt" type="date" required defaultValue={resident ? resident.joinedAt.slice(0, 10) : todayDateInputValue()} /></label>
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
