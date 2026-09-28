import { useState } from 'react'
import { Plus, Users, X } from 'lucide-react'
import { readApiError } from './superAdmin'

type StaffProperty = { id: string; name: string; housekeepingStaff: string[] }

/**
 * The owner's housekeeping staff for each property: names added and removed as chips, saved at
 * once. Residents of that property see the count and names in their Housekeeping card.
 */
export function HousekeepingStaffPanel({ properties, onSaved, onNotice }: { properties: StaffProperty[]; onSaved: (propertyId: string, names: string[]) => void; onNotice: (message: string) => void }) {
  const [chosenId, setChosenId] = useState(properties[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const property = properties.find((item) => item.id === chosenId) ?? properties[0]
  if (!property) return null
  const staff = property.housekeepingStaff

  async function save(names: string[], success: string) {
    setIsSaving(true)
    const response = await fetch(`/api/properties/${property.id}/housekeeping-staff`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Staff could not be saved.') : 'Could not reach the server.'); return false }
    onSaved(property.id, (await response.json() as { names: string[] }).names)
    onNotice(success)
    return true
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draft.trim()
    if (!name) return
    if (await save([...staff, name], `${name} added to housekeeping staff.`)) setDraft('')
  }

  return (
    <div className="housekeeping-staff">
      <div className="housekeeping-staff-head">
        <span className="housekeeping-staff-icon"><Users size={17} /></span>
        <div><strong>Housekeeping staff{properties.length > 1 ? '' : ` · ${property.name}`}</strong><small>{staff.length ? `${staff.length} ${staff.length === 1 ? 'person' : 'people'}, shown to residents` : 'Add the people who clean; residents see their names'}</small></div>
        {properties.length > 1 && <select aria-label="Property" value={property.id} onChange={(event) => setChosenId(event.target.value)}>{properties.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.housekeepingStaff.length})</option>)}</select>}
      </div>
      <div className="housekeeping-staff-list">
        {staff.map((name) => <span key={name} className="staff-chip">{name}<button type="button" aria-label={`Remove ${name}`} disabled={isSaving} onClick={() => void save(staff.filter((item) => item !== name), `${name} removed.`)}><X size={12} /></button></span>)}
        <form onSubmit={add}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={40} placeholder="Add a name" aria-label="Staff name" /><button type="submit" className="icon-button" aria-label="Add staff" disabled={isSaving || !draft.trim()}><Plus size={15} /></button></form>
      </div>
    </div>
  )
}
