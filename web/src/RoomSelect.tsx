import { useEffect, useState } from 'react'
import { fetchRooms, type Room } from './rooms'

/**
 * Room picker for the resident form: the chosen property's free rooms, plus the resident's current
 * room when editing (it is "taken" by them, but must stay selectable). Rooms come from the owner's
 * list under Properties, so there is nothing to type and no way to invent a room.
 */
export function RoomSelect({ propertyId, currentRoom }: { propertyId: string; currentRoom?: string }) {
  const [loaded, setLoaded] = useState<{ propertyId: string; rooms: Room[] } | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!propertyId) return
    let isCurrent = true
    fetchRooms(propertyId).then((data) => { if (isCurrent) setLoaded({ propertyId, rooms: data.rooms }) }, () => { if (isCurrent) setFailedFor(propertyId) })
    return () => { isCurrent = false }
  }, [propertyId])

  const label = <>Room <span>(free rooms in this property)</span></>
  if (!propertyId) return <label>{label}<select name="roomNumber" required disabled defaultValue=""><option value="">Choose a property first</option></select></label>
  if (failedFor === propertyId) return <label>{label}<select name="roomNumber" required disabled defaultValue=""><option value="">Rooms could not be loaded</option></select></label>
  if (loaded?.propertyId !== propertyId) return <label>{label}<select name="roomNumber" required disabled defaultValue=""><option value="">Loading rooms…</option></select></label>

  const options = loaded.rooms.filter((room) => !room.residentName || room.number === currentRoom)
  if (!options.length) return <div className="room-select-empty">{label}<p>No free rooms. Add rooms under <strong>Properties</strong>, using the <strong>Rooms</strong> button on this property's card.</p></div>
  return (
    // Keyed by property so switching property resets the selection to a room that exists there.
    <label key={propertyId}>{label}<select name="roomNumber" required defaultValue={options.some((room) => room.number === currentRoom) ? currentRoom : ''}>
      <option value="" disabled>Select a room</option>
      {options.map((room) => <option key={room.id} value={room.number}>{room.number}{room.number === currentRoom ? ' (current)' : ''}</option>)}
    </select></label>
  )
}
