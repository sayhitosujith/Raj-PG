import { useState } from 'react'
import { Send, X } from 'lucide-react'
import { todayDateInputValue } from './joinDate'
import { ModalLayer } from './ModalLayer'
import { PhoneField } from './PhoneField'
import { priceFor } from './pricing'
import { RoomSelect } from './RoomSelect'
import { sharingLabel } from './rooms'
import { linkOutcomeText, type RegistrationLinkResult } from './registrationLink'
import { RegistrationLinkShare } from './RegistrationLinkShare'
import { readApiError } from './superAdmin'

type InviteProperty = { id?: string; name: string; rentWithFood?: number | null; rentWithoutFood?: number | null }

/**
 * Staff reserve a bed for a new resident and WhatsApp them a link to fill in their own details (personal,
 * emergency contact, vehicle, ID document, live photo and a password). Only what staff decide is asked here:
 * who and where the link goes, the bed, food plan, rent and joining date. When the app's WhatsApp is off or fails,
 * staff send it from their own WhatsApp with the message ready (or copy it), so the invite is never lost.
 */
export function InviteResidentModal({ properties, onClose, onInvited, onNotice }: { properties: InviteProperty[]; onClose: () => void; /** Reloads the residents list, where the invite now shows. */ onInvited: () => void; onNotice: (message: string) => void }) {
  const [propertyId, setPropertyId] = useState('')
  const [foodOpted, setFoodOpted] = useState(true)
  const [roomBeds, setRoomBeds] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ name: string; phone: string | null; link: RegistrationLinkResult } | null>(null)
  const selectedProperty = properties.find((property) => property.id === propertyId)
  const rentFor = (withFood: boolean) => priceFor(selectedProperty, roomBeds, withFood)
  const pricedRent = rentFor(foodOpted)

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fields = Object.fromEntries(['name', 'phone', 'propertyId', 'roomNumber', 'bedNumber', 'monthlyRent', 'joinedAt'].map((field) => [field, String(form.get(field) ?? '')]))
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/residents/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, foodOpted }) })
      if (!response.ok) { setError(await readApiError(response, 'The registration link could not be created.')); return }
      const saved = await response.json() as RegistrationLinkResult & { name: string; phone: string | null }
      onInvited()
      if (saved.whatsapp === 'sent') { onNotice(linkOutcomeText(saved.name, saved)); onClose(); return }
      setResult({ name: saved.name, phone: saved.phone, link: saved })
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      {result
        ? <div className="profile-modal" role="dialog" aria-labelledby="invite-result-title">
            <div className="modal-heading"><div><p className="eyebrow">Residents</p><h2 id="invite-result-title">Bed reserved for {result.name}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
            <p className="login-hint" role="status">{linkOutcomeText(result.name, result.link)}</p>
            <RegistrationLinkShare name={result.name} phone={result.phone} link={result.link.registrationLink} onNotice={onNotice} />
            <p className="login-hint">The link works for 7 days and only once. You can send a new one from the resident's row.</p>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Done</button></div>
          </div>
        : <form className="profile-modal resident-modal" onSubmit={send}>
            <div className="modal-heading"><div><p className="eyebrow">Residents</p><h2>Send registration link</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
            <p className="login-hint invite-intro">Reserve a bed and WhatsApp the new resident a link to fill in their own details, ID and photo. You review and approve it before they can sign in.</p>
            <label>Resident name<input name="name" required placeholder="e.g. Ananya Sharma" /></label>
            <PhoneField name="phone" label="WhatsApp number" required />
            <label>Property<select name="propertyId" required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="" disabled>Select property</option>{properties.filter((property) => property.id).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
            <RoomSelect propertyId={propertyId} onBedsChange={setRoomBeds} />
            <fieldset className="food-plan">
              <legend>Food plan</legend>
              <div className="food-plan-options">
                {([true, false] as const).map((option) => (
                  <label key={String(option)} className={`food-plan-option${foodOpted === option ? ' is-selected' : ''}`}>
                    <input type="radio" name="foodOpted" checked={foodOpted === option} onChange={() => setFoodOpted(option)} />
                    <strong>{option ? 'With food' : 'Without food'}</strong>
                    {rentFor(option) !== null ? <small>₹{rentFor(option)?.toLocaleString('en-IN')} / month</small> : <small>{option ? 'Menu, skips and meal alerts' : 'No food features'}</small>}
                  </label>
                ))}
              </div>
            </fieldset>
            {pricedRent !== null
              ? <p className="priced-rent">Monthly rent <strong>₹{pricedRent.toLocaleString('en-IN')}</strong> <span>set by {selectedProperty?.name} for {roomBeds ? `${sharingLabel(roomBeds).toLowerCase()}, ` : ''}{foodOpted ? 'with food' : 'without food'}</span></p>
              : <label>Monthly rent (₹) <span>(leave blank to not track)</span><input name="monthlyRent" type="number" inputMode="numeric" min={0} max={1000000} step={1} placeholder="e.g. 8500" /></label>}
            <label>Joining date<input name="joinedAt" type="date" required defaultValue={todayDateInputValue()} /></label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}><Send size={15} /> {isSaving ? 'Sending…' : 'Send link on WhatsApp'}</button></div>
          </form>}
    </div></ModalLayer>
  )
}
