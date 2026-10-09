import { useEffect, useState } from 'react'
import { DoorOpen, Trash2, X } from 'lucide-react'
import { InlineLoader } from './Loader'
import { fetchRooms, freeBeds, maxBeds, sharingLabel, type PropertyRooms, type Room } from './rooms'
import { readApiError } from './superAdmin'
import { ModalLayer } from './ModalLayer'

const maxRange = 200
const bedChoices = Array.from({ length: maxBeds }, (_, index) => index + 1)

/** Bed-count picker shared by the add forms and each room row. */
function BedsSelect({ name, value, defaultValue, disabled, label, onChange }: { name?: string; value?: number; defaultValue?: number; disabled?: boolean; label: string; onChange?: (beds: number) => void }) {
  return <select name={name} value={value} defaultValue={defaultValue} disabled={disabled} aria-label={label} title={label} onChange={onChange && ((event) => onChange(Number(event.target.value)))}>{bedChoices.map((beds) => <option key={beds} value={beds}>{sharingLabel(beds)}</option>)}</select>
}

/** Who lives in a room, and how many beds are still free when it is shared. */
function occupantsText(room: Room) {
  if (!room.residentNames.length) return room.beds > 1 ? `Free · ${room.beds} beds` : 'Free'
  const free = freeBeds(room)
  return `${room.residentNames.join(', ')}${free ? ` · ${free} ${free === 1 ? 'bed' : 'beds'} free` : ''}`
}

/**
 * Owner's room list for one property: see who is in each room, generate a numbered range
 * (e.g. 101 to 110), add a single room (e.g. G1), set how many beds each room has, and remove empty rooms. These are the only rooms
 * the resident form offers.
 */
export function RoomsManager({ propertyId, propertyName, onClose, onNotice }: { propertyId: string; propertyName: string; onClose: () => void; onNotice: (message: string) => void }) {
  const [data, setData] = useState<PropertyRooms | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { fetchRooms(propertyId).then(setData, () => setError('Rooms could not be loaded.')) }, [propertyId])

  async function add(numbers: string[], beds: number) {
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/properties/${propertyId}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numbers, beds }) })
      if (!response.ok) { setError(await readApiError(response, 'Rooms could not be added.')); return false }
      const result = await response.json() as PropertyRooms & { added: number; skipped: number }
      setData(result)
      onNotice(`${result.added} ${result.added === 1 ? 'room' : 'rooms'} added${result.skipped ? `; ${result.skipped} already existed` : ''}.`)
      return true
    } catch {
      setError('Could not reach the server.')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  async function addRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const from = Number(new FormData(form).get('from'))
    const to = Number(new FormData(form).get('to'))
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) { setError('Enter a range where "to" is not smaller than "from".'); return }
    if (to - from + 1 > maxRange) { setError(`Add up to ${maxRange} rooms at a time.`); return }
    if (await add(Array.from({ length: to - from + 1 }, (_, index) => String(from + index)), Number(new FormData(form).get('beds')))) form.reset()
  }

  async function addOne(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const number = String(new FormData(form).get('number') ?? '').trim()
    if (number && await add([number], Number(new FormData(form).get('beds')))) form.reset()
  }

  async function setBeds(room: Room, beds: number) {
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/properties/${propertyId}/rooms/${room.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beds }) })
      if (!response.ok) { setError(await readApiError(response, 'The room could not be updated.')); return }
      setData(await response.json() as PropertyRooms)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  async function remove(roomId: string, number: string) {
    if (!window.confirm(`Remove room ${number}?`)) return
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/properties/${propertyId}/rooms/${roomId}`, { method: 'DELETE' })
      if (!response.ok) { setError(await readApiError(response, 'The room could not be removed.')); return }
      setData(await response.json() as PropertyRooms)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  const totalBeds = data?.rooms.reduce((sum, room) => sum + room.beds, 0) ?? 0
  const free = data?.rooms.reduce((sum, room) => sum + freeBeds(room), 0) ?? 0
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="profile-modal rooms-modal" role="dialog" aria-modal="true" aria-labelledby="rooms-title">
        <div className="modal-heading"><div><p className="eyebrow">{propertyName}</p><h2 id="rooms-title">Rooms</h2></div><button type="button" className="icon-button" aria-label="Close rooms" onClick={onClose}><X size={18} /></button></div>
        {!data ? (error ? <p className="login-error" role="alert">{error}</p> : <InlineLoader label="Loading rooms…" />) : <>
          <p className="rooms-summary">{data.rooms.length}{data.totalRooms ? ` of ${data.totalRooms}` : ''} rooms defined · {totalBeds} {totalBeds === 1 ? 'bed' : 'beds'} · {free} free</p>
          <form className="rooms-add" onSubmit={addRange}>
            <span>Add a range</span>
            <input name="from" type="number" inputMode="numeric" min={1} required placeholder="From, e.g. 101" aria-label="First room number" />
            <input name="to" type="number" inputMode="numeric" min={1} required placeholder="To, e.g. 110" aria-label="Last room number" />
            <BedsSelect name="beds" defaultValue={1} label="Beds in each room" />
            <button type="submit" className="primary-button" disabled={isSaving}>Add</button>
          </form>
          <form className="rooms-add" onSubmit={addOne}>
            <span>Add one room</span>
            <input name="number" maxLength={12} pattern="[A-Za-z0-9\-]+" title="Letters, digits and dashes" required placeholder="e.g. G1" aria-label="Room number" />
            <BedsSelect name="beds" defaultValue={1} label="Beds in this room" />
            <button type="submit" className="secondary-button" disabled={isSaving}>Add</button>
          </form>
          {error && <p className="login-error" role="alert">{error}</p>}
          {data.rooms.length
            ? <ul className="rooms-list">{data.rooms.map((room) => (
              <li key={room.id} className={room.residentNames.length ? 'is-occupied' : undefined}>
                <DoorOpen size={14} aria-hidden="true" />
                <strong>{room.number}</strong>
                <small title={occupantsText(room)}>{occupantsText(room)}</small>
                <BedsSelect value={room.beds} disabled={isSaving} label={`Beds in room ${room.number}`} onChange={(beds) => void setBeds(room, beds)} />
                {!room.residentNames.length && <button type="button" className="icon-button" aria-label={`Remove room ${room.number}`} title="Remove room" disabled={isSaving} onClick={() => remove(room.id, room.number)}><Trash2 size={13} /></button>}
              </li>
            ))}</ul>
            : <p className="portal-empty">No rooms yet. Add a range such as 101 to 110 to get started.</p>}
        </>}
      </div>
    </div></ModalLayer>
  )
}
