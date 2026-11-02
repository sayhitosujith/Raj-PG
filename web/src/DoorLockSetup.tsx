import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { readApiError } from './superAdmin'

/** One of a property's smart locks; mirrors the API's DoorLock. */
type DoorLock = { id: string; propertyId: string; name: string; forResidents: boolean; forStaff: boolean }
type Draft = { name: string; forResidents: boolean; forStaff: boolean }

const audienceText = (lock: Draft) => (lock.forResidents && lock.forStaff ? 'Residents and staff' : lock.forResidents ? 'Residents' : 'Staff')

function LockForm({ initial, isSaving, onSave, onCancel }: { initial: Draft; isSaving: boolean; onSave: (draft: Draft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial)
  return (
    <form className="door-lock-form" onSubmit={(event) => { event.preventDefault(); onSave(draft) }}>
      <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={40} required placeholder="e.g. Main door" aria-label="Lock name" autoFocus />
      <label><input type="checkbox" checked={draft.forResidents} onChange={(event) => setDraft({ ...draft, forResidents: event.target.checked })} /> Residents</label>
      <label><input type="checkbox" checked={draft.forStaff} onChange={(event) => setDraft({ ...draft, forStaff: event.target.checked })} /> Staff</label>
      <button type="submit" className="primary-button" disabled={isSaving || (!draft.forResidents && !draft.forStaff)}>{isSaving ? 'Saving…' : 'Save'}</button>
      <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
    </form>
  )
}

/**
 * Each property's door locks and who gets a PIN on them. Every change re-queues the PINs to add or delete,
 * so `onChanged` reloads the to-do list. A property with no locks listed keeps its one unnamed lock for
 * residents; the first lock listed is taken to be that one, so PINs already on it are not asked for again.
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
      <h3 className="door-lock-done-title">Locks</h3>
      {properties.map((property) => {
        const propertyLocks = locks?.filter((lock) => lock.propertyId === property.id) ?? []
        return (
          <div key={property.id} className="door-lock-property">
            <strong>{property.name}</strong>
            {locks && !propertyLocks.length && <small>No locks listed: residents' PINs go on one unnamed lock. Add each lock to choose who uses it.</small>}
            {propertyLocks.map((lock) => editing === lock.id
              ? <LockForm key={lock.id} initial={lock} isSaving={isSaving} onCancel={() => setEditing(null)} onSave={(draft) => void send(`/api/door-locks/${lock.id}`, 'PUT', draft, `${draft.name} saved. Any PIN changes are on the list above.`)} />
              : <div key={lock.id} className="door-lock-item">
                  <span><b>{lock.name}</b> <small>{audienceText(lock)}</small></span>
                  <button type="button" className="icon-button" aria-label={`Edit ${lock.name}`} title="Edit" onClick={() => setEditing(lock.id)}><Pencil size={13} /></button>
                  <button type="button" className="icon-button" aria-label={`Remove ${lock.name}`} title="Remove" disabled={isSaving} onClick={() => remove(lock)}><Trash2 size={13} /></button>
                </div>)}
            {editing === `new:${property.id}`
              ? <LockForm initial={{ name: '', forResidents: true, forStaff: false }} isSaving={isSaving} onCancel={() => setEditing(null)} onSave={(draft) => void send('/api/door-locks', 'POST', { ...draft, propertyId: property.id }, `${draft.name} added. The PINs to put on it are on the list above.`)} />
              : <button type="button" className="text-link door-lock-add" onClick={() => setEditing(`new:${property.id}`)}><Plus size={12} /> Add lock</button>}
          </div>
        )
      })}
    </section>
  )
}
