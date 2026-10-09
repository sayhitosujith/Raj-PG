import { useEffect, useState } from 'react'
import { fetchRooms, freeBeds, sharingLabel, type Room } from './rooms'

/**
 * Room picker for the resident form: the chosen property's rooms with a free bed, plus the resident's
 * current room when editing (their own bed is taken by them, but the room must stay selectable). Rooms come from the owner's
 * list under Properties, so there is nothing to type and no way to invent a room. Reports the chosen
 * room's bed count (null when none is chosen), since a sharing type can have its own price.
 */
export function RoomSelect({ propertyId, currentRoom, onBedsChange }: { propertyId: string; currentRoom?: string; onBedsChange: (beds: number | null) => void }) {
  const [loaded, setLoaded] = useState<{ propertyId: string; rooms: Room[] } | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!propertyId) return
    let isCurrent = true
    fetchRooms(propertyId).then((data) => { if (isCurrent) setLoaded({ propertyId, rooms: data.rooms }) }, () => { if (isCurrent) setFailedFor(propertyId) })
    return () => { isCurrent = false }
  }, [propertyId])

  // The preselected room once this property's rooms arrive; nothing while they load.
  useEffect(() => {
    onBedsChange(loaded?.propertyId === propertyId ? loaded.rooms.find((room) => room.number === currentRoom)?.beds ?? null : null)
  }, [loaded, propertyId, currentRoom, onBedsChange])

  const label = <>Room <span>(rooms with a free bed)</span></>
  if (!propertyId) return <label>{label}<select name="roomNumber" required disabled defaultValue=""><option value="">Choose a property first</option></select></label>
  if (failedFor === propertyId) return <label>{label}<select name="roomNumber" required disabled defaultValue=""><option value="">Rooms could not be loaded</option></select></label>
  if (loaded?.propertyId !== propertyId) return <label>{label}<select name="roomNumber" required disabled defaultValue=""><option value="">Loading rooms…</option></select></label>

  const options = loaded.rooms.filter((room) => freeBeds(room) > 0 || room.number === currentRoom)
  if (!options.length) return <div className="room-select-empty">{label}<p>No free beds. Add rooms or beds under <strong>Properties</strong>, using the <strong>Rooms</strong> button on this property's card.</p></div>
  return (
    // Keyed by property so switching property resets the selection to a room that exists there.
    <label key={propertyId}>{label}<select name="roomNumber" required defaultValue={options.some((room) => room.number === currentRoom) ? currentRoom : ''} onChange={(event) => onBedsChange(options.find((room) => room.number === event.target.value)?.beds ?? null)}>
      <option value="" disabled>Select a room</option>
      {options.map((room) => <option key={room.id} value={room.number}>{room.number} · {sharingLabel(room.beds)}{room.number === currentRoom ? ' (current)' : room.beds > 1 ? ` · ${freeBeds(room)} of ${room.beds} beds free` : ''}</option>)}
    </select></label>
  )
}
