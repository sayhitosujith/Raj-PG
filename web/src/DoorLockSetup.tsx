import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { readApiError } from './superAdmin'

/** Kinds of access device, in the order the form offers them; keys match the server's list. */
const deviceTypeLabels: Record<string, string> = { SMART_LOCK: 'Smart door lock', FINGERPRINT_LOCK: 'Fingerprint lock', CARD_LOCK: 'RFID / card lock', GATE_CONTROLLER: 'Gate / boom controller' }
/** Ways a device opens; only PIN devices get PIN tasks. */
const unlockMethodLabels: Record<string, string> = { PIN: 'PIN', FINGERPRINT: 'Fingerprint', CARD: 'Card', APP: 'App' }

type Draft = { name: string; deviceType: string; brand: string; model: string; serialNumber: string; unlockMethods: string[]; installedAt: string; notes: string; forResidents: boolean; forStaff: boolean }
/** One of a property's access devices; mirrors the API's DoorLock. */
type DoorLock = Omit<Draft, 'brand' | 'model' | 'serialNumber' | 'installedAt' | 'notes'> & { id: string; propertyId: string; brand: string | null; model: string | null; serialNumber: string | null; installedAt: string | null; notes: string | null }

const emptyDraft: Draft = { name: '', deviceType: 'SMART_LOCK', brand: '', model: '', serialNumber: '', unlockMethods: ['PIN'], installedAt: '', notes: '', forResidents: true, forStaff: false }
const toDraft = (lock: DoorLock): Draft => ({ name: lock.name, deviceType: lock.deviceType, brand: lock.brand ?? '', model: lock.model ?? '', serialNumber: lock.serialNumber ?? '', unlockMethods: lock.unlockMethods, installedAt: lock.installedAt ?? '', notes: lock.notes ?? '', forResidents: lock.forResidents, forStaff: lock.forStaff })

const audienceText = (lock: DoorLock) => (lock.forResidents && lock.forStaff ? 'Residents and staff' : lock.forResidents ? 'Residents' : 'Staff')

function LockForm({ initial, isSaving, onSave, onCancel }: { initial: Draft; isSaving: boolean; onSave: (draft: Draft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const toggleMethod = (method: string, on: boolean) => set('unlockMethods', on ? [...draft.unlockMethods, method] : draft.unlockMethods.filter((item) => item !== method))
  const isValid = draft.name.trim() && draft.unlockMethods.length && (draft.forResidents || draft.forStaff)
  return (
    <form className="door-lock-form" onSubmit={(event) => { event.preventDefault(); onSave(draft) }}>
      <label>Name<input value={draft.name} onChange={(event) => set('name', event.target.value)} maxLength={40} required placeholder="e.g. Main door" autoFocus /></label>
      <label>Device type<select value={draft.deviceType} onChange={(event) => set('deviceType', event.target.value)}>{Object.entries(deviceTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Brand<input value={draft.brand} onChange={(event) => set('brand', event.target.value)} maxLength={40} placeholder="e.g. Qubo" /></label>
      <label>Model<input value={draft.model} onChange={(event) => set('model', event.target.value)} maxLength={60} placeholder="e.g. Select Q45765" /></label>
      <label>Device ID / serial<input value={draft.serialNumber} onChange={(event) => set('serialNumber', event.target.value)} maxLength={80} placeholder="As shown in the lock's app" /></label>
      <label>Location<input value={draft.installedAt} onChange={(event) => set('installedAt', event.target.value)} maxLength={80} placeholder="e.g. Ground floor, rear" /></label>
      <fieldset><legend>Opens with</legend>{Object.entries(unlockMethodLabels).map(([value, label]) => <label key={value}><input type="checkbox" checked={draft.unlockMethods.includes(value)} onChange={(event) => toggleMethod(value, event.target.checked)} /> {label}</label>)}</fieldset>
      <fieldset><legend>Used by</legend><label><input type="checkbox" checked={draft.forResidents} onChange={(event) => set('forResidents', event.target.checked)} /> Residents</label><label><input type="checkbox" checked={draft.forStaff} onChange={(event) => set('forStaff', event.target.checked)} /> Staff</label></fieldset>
      <label className="door-lock-form-wide">Notes<textarea value={draft.notes} onChange={(event) => set('notes', event.target.value)} maxLength={500} rows={2} placeholder="Anything worth knowing, e.g. battery changed in Oct" /></label>
      {!draft.unlockMethods.includes('PIN') && <small className="door-lock-form-wide">Without PIN, no PINs are queued for this device; access is managed on the device itself.</small>}
      <div className="door-lock-form-actions door-lock-form-wide"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving || !isValid}>{isSaving ? 'Saving…' : 'Save'}</button></div>
    </form>
  )
}

/**
 * Each property's access devices: type, brand and model, device ID, how they open, where they are and who uses
 * them. Every change re-queues the PINs to add or delete, so `onChanged` reloads the to-do list. A property with
 * no devices listed keeps its one unnamed lock for residents; the first one listed is taken to be that lock, so
 * PINs already on it are not asked for again.
 */
export function DoorLockSetup({ properties, onChanged, onNotice }: { properties: Array<{ id: string; name: string }>; onChanged: () => void; onNotice: (message: string) => void }) {
  const [locks, setLocks] = useState<DoorLock[] | null>(null)
  // The lock being edited, or "new:<propertyId>" while adding one to that property.
  const [editing, setEditing] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const load = () => void fetch('/api/door-locks').then((response) => response.ok ? response.json() as Promise<DoorLock[]> : Promise.reject(new Error('failed'))).then(setLocks, () => onNotice('Door locks could not be loaded.'))
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps -- loaded once; changes reload it

  async function send(url: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown, done: string) {
    setIsSaving(true)
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      if (!response.ok) { onNotice(await readApiError(response, 'The lock could not be saved.')); return }
      setEditing(null)
      onNotice(done)
      load()
      onChanged()
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  function remove(lock: DoorLock) {
    if (!window.confirm(`Remove ${lock.name}? Its unfinished tasks are dropped. PINs already on it stay on the lock itself until you delete them there.`)) return
    void send(`/api/door-locks/${lock.id}`, 'DELETE', undefined, `${lock.name} removed.`)
  }

  return (
    <section className="door-lock-setup" aria-label="Locks">
      <h3 className="door-lock-done-title">Devices by property</h3>
      {properties.map((property) => {
        const propertyLocks = locks?.filter((lock) => lock.propertyId === property.id) ?? []
        return (
          <div key={property.id} className="door-lock-property">
            <strong>{property.name}</strong>
            {locks && !propertyLocks.length && <small>No devices listed: residents' PINs go on one unnamed lock. Add each device to choose its type and who uses it.</small>}
            {propertyLocks.map((lock) => editing === lock.id
              ? <LockForm key={lock.id} initial={toDraft(lock)} isSaving={isSaving} onCancel={() => setEditing(null)} onSave={(draft) => void send(`/api/door-locks/${lock.id}`, 'PUT', draft, `${draft.name} saved. Any PIN changes it needs are under Lock tasks.`)} />
              : <div key={lock.id} className="door-lock-item">
                  <div className="door-lock-item-text">
                    <span><b>{lock.name}</b> <span className="resident-badge">{deviceTypeLabels[lock.deviceType] ?? lock.deviceType}</span></span>
                    <small>{[[lock.brand, lock.model].filter(Boolean).join(' '), lock.serialNumber && `ID ${lock.serialNumber}`, lock.installedAt].filter(Boolean).join(' · ') || 'No brand or model added'}</small>
                    <small>Opens with {lock.unlockMethods.map((method) => unlockMethodLabels[method] ?? method).join(', ')} · {audienceText(lock)}</small>
                    {lock.notes && <small className="door-lock-notes">{lock.notes}</small>}
                  </div>
                  <button type="button" className="icon-button" aria-label={`Edit ${lock.name}`} title="Edit" onClick={() => setEditing(lock.id)}><Pencil size={13} /></button>
                  <button type="button" className="icon-button" aria-label={`Remove ${lock.name}`} title="Remove" disabled={isSaving} onClick={() => remove(lock)}><Trash2 size={13} /></button>
                </div>)}
            {editing === `new:${property.id}`
              ? <LockForm initial={emptyDraft} isSaving={isSaving} onCancel={() => setEditing(null)} onSave={(draft) => void send('/api/door-locks', 'POST', { ...draft, propertyId: property.id }, `${draft.name} added. The PINs to put on it are under Lock tasks.`)} />
              : <button type="button" className="text-link door-lock-add" onClick={() => setEditing(`new:${property.id}`)}><Plus size={12} /> Add device</button>}
          </div>
        )
      })}
    </section>
  )
}
