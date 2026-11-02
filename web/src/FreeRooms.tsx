import { useState } from 'react'
import { BedDouble } from 'lucide-react'
import { BedOccupantCard, type BedOccupant } from './BedOccupantCard'
import { readApiError } from './superAdmin'

/** A free bed staff are holding back (see the backend's bedReservations.ts). */
export type BedHold = { id: string; bed: number; note: string | null; reservedByName: string | null; createdAt: string }

/**
 * One set-up room at a property, as the Dashboard's room grid receives it: its beds, the bed numbers that
 * are booked and who is in each, the beds held back as reservations, and residents in it without a bed
 * number yet (they still use a bed).
 */
export type RoomOccupancy = { number: string; beds: number; bookedBeds: number[]; occupants: BedOccupant[]; reservations: BedHold[]; unassigned: number }

// Every room is shown; this only guards against an extreme property, past which the grid ends with "+N more rooms".
const shownRooms = 300

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
const bedKey = (roomNumber: string, bed: number) => `${roomNumber}#${bed}`

/** Which bed numbers in a room are free: not booked, not reserved; residents without a bed number use up free beds from the end. */
function freeBedsOf(room: RoomOccupancy) {
  const unavailable = new Set([...room.bookedBeds, ...room.reservations.map((hold) => hold.bed)])
  const free = Array.from({ length: room.beds }, (_, index) => index + 1).filter((bed) => !unavailable.has(bed))
  return free.slice(0, Math.max(0, free.length - room.unassigned))
}

/**
 * The Overview tip's room grid: a hero number and a meter for the property's free beds against its total,
 * then every room as a tile with its beds numbered 1 to N, each state in its own colour and shape: free
 * green and round, booked slate and square (red when rent is owed, see BookedBed), reserved amber and diamond. Hover a booked bed to see who is in
 * it (BedOccupantCard). A free bed starts "Add resident" in that bed (`onAddResident`); in "Select beds"
 * mode, free beds are ticked instead and reserved together, with an optional note. Clicking a reserved
 * bed offers to release it. Every bed is labelled for screen readers, so nothing depends on colour or
 * hover. Colours were checked with the dataviz palette validator against the card's surfaces (the dark
 * amber sits slightly above the dark band: any darker amber blurs into the red for colour-blind viewers,
 * so the diamond shape carries the difference too).
 */
export function FreeRooms({ propertyId, beds, rooms, notSetUp, onAddResident, onChanged, onNotice }: { propertyId: string; beds: { taken: number; total: number }; rooms: RoomOccupancy[]; notSetUp: number; onAddResident: (roomNumber: string, bed: number) => void; onChanged: () => void; onNotice: (message: string) => void }) {
  // The booked bed being hovered or focused, with where it is on screen, for its resident card.
  const [shownOccupant, setShownOccupant] = useState<{ occupant: BedOccupant; roomNumber: string; anchor: DOMRect } | null>(null)
  // Select mode: free beds ticked for reserving, keyed "room#bed".
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Map<string, { roomNumber: string; bed: number }>>(new Map())
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  if (!beds.total) return null
  const reservedCount = rooms.reduce((sum, room) => sum + room.reservations.length, 0)
  const free = Math.max(0, beds.total - beds.taken - reservedCount)
  const shown = rooms.slice(0, shownRooms)
  const hidden = rooms.length - shown.length
  const withFree = rooms.map((room) => ({ room, free: freeBedsOf(room) }))
  const roomsWithSpace = withFree.filter((entry) => entry.free.length > 0).length
  const unassigned = rooms.reduce((sum, room) => sum + room.unassigned, 0)
  const share = (count: number) => `${(count / beds.total) * 100}%`

  function toggle(roomNumber: string, bed: number) {
    setSelected((current) => {
      const next = new Map(current)
      const key = bedKey(roomNumber, bed)
      if (next.has(key)) next.delete(key)
      else next.set(key, { roomNumber, bed })
      return next
    })
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Map())
    setNote('')
  }

  async function reserve() {
    setIsSaving(true)
    const response = await fetch(`/api/properties/${propertyId}/bed-reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beds: [...selected.values()], note }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'The beds could not be reserved.') : 'Could not reach the server.'); return }
    onNotice(`${plural(selected.size, 'bed')} reserved.`)
    stopSelecting()
    onChanged()
  }

  async function release(roomNumber: string, hold: BedHold) {
    if (!window.confirm(`Release the reservation on room ${roomNumber}, bed ${hold.bed}? It becomes a free bed again.`)) return
    const response = await fetch(`/api/properties/${propertyId}/bed-reservations/${hold.id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'The reservation could not be released.') : 'Could not reach the server.'); return }
    onNotice(`Room ${roomNumber}, bed ${hold.bed} is free again.`)
    onChanged()
  }

  return (
    <figure className="free-chart">
      <figcaption className="free-chart-head"><strong className="free-chart-hero">{free}</strong> {free === 1 ? 'bed' : 'beds'} free <span>of {beds.total}{reservedCount ? ` · ${reservedCount} reserved` : ''}{rooms.length ? ` · ${roomsWithSpace} of ${plural(rooms.length, 'room')} have space` : ''}</span></figcaption>
      <div className="free-meter" aria-hidden="true">
        {beds.taken > 0 && <span className="is-taken" style={{ width: share(beds.taken) }} />}
        {reservedCount > 0 && <span className="is-held" style={{ width: share(reservedCount) }} />}
        {free > 0 && <span className="is-free" style={{ width: share(free) }} />}
      </div>
      <div className="free-chart-bar">
        <ul className="free-legend" aria-hidden="true"><li><i className="is-free" />Free bed</li><li><i className="is-taken" />Booked · rent paid</li><li><i className="is-taken is-owed is-due" />Rent due</li><li><i className="is-taken is-owed is-overdue" />Rent overdue</li><li><i className="is-held" />Reserved</li></ul>
        {shown.length > 0 && (selecting
          ? <div className="reserve-bar" role="group" aria-label="Reserve selected beds">
              <span>{selected.size ? `${plural(selected.size, 'bed')} selected` : 'Tap free beds to select them'}</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="Note (optional)" aria-label="Reservation note" />
              <button type="button" className="primary-button" disabled={!selected.size || isSaving} onClick={() => void reserve()}>{isSaving ? 'Reserving…' : 'Reserve'}</button>
              <button type="button" className="secondary-button" onClick={stopSelecting}>Cancel</button>
            </div>
          : <button type="button" className="primary-button reserve-start" onClick={() => setSelecting(true)}><BedDouble size={15} /> Select beds to reserve</button>)}
      </div>
      {shown.length > 0 && <ul className={`room-grid${selecting ? ' is-selecting' : ''}`} aria-label={selecting ? 'Rooms and beds; choose free beds to reserve' : 'Rooms and beds; choose a free bed to add a resident to it'}>
        {withFree.slice(0, shownRooms).map(({ room, free: freeBeds }) => (
          <li key={room.number} className={`room-tile${freeBeds.length ? ' has-space' : ' is-full'}`}>
            <span className="room-tile-number"><span className="sr-only">Room </span>{room.number}</span>
            <span className="room-tile-beds">{Array.from({ length: room.beds }, (_, index) => {
              const bed = index + 1
              const hold = room.reservations.find((item) => item.bed === bed)
              if (hold) return <button key={bed} type="button" className="is-held" aria-label={`Bed ${bed}, reserved${hold.note ? `: ${hold.note}` : ''}. Release it`} title={`Reserved${hold.reservedByName ? ` by ${hold.reservedByName}` : ''}${hold.note ? ` · ${hold.note}` : ''} · click to release`} onClick={() => void release(room.number, hold)}><span>{bed}</span></button>
              if (!freeBeds.includes(bed)) return <BookedBed key={bed} bed={bed} occupant={room.occupants.find((occupant) => occupant.bed === bed)} onShow={(occupant, anchor) => setShownOccupant({ occupant, roomNumber: room.number, anchor })} onHide={() => setShownOccupant(null)} />
              if (selecting) {
                const isPicked = selected.has(bedKey(room.number, bed))
                return <button key={bed} type="button" className={`is-free${isPicked ? ' is-picked' : ''}`} aria-pressed={isPicked} aria-label={`Bed ${bed}, free: ${isPicked ? 'selected' : 'select'} for reserving`} onClick={() => toggle(room.number, bed)}>{bed}</button>
              }
              return <button key={bed} type="button" className="is-free" aria-label={`Bed ${bed}, free: add a resident`} title={`Add a resident to room ${room.number}, bed ${bed}`} onClick={() => onAddResident(room.number, bed)}>{bed}</button>
            })}</span>
          </li>
        ))}
      </ul>}
      {(hidden > 0 || notSetUp > 0 || unassigned > 0) && <p className="free-chart-note">
        {[
          hidden > 0 && `+${plural(hidden, 'more room')}`,
          unassigned > 0 && `${plural(unassigned, 'resident')} without a bed number yet`,
          notSetUp > 0 && `+${plural(notSetUp, 'room')} not set up yet (1 bed each until added under Rooms)`,
        ].filter(Boolean).join(' · ')}
      </p>}
      {shownOccupant && <BedOccupantCard {...shownOccupant} />}
    </figure>
  )
}

// Red is kept for money owed: overdue beds are filled red, rent due this month (not yet late) is outlined red.
// Paid-up, next-due-later and untracked rent all stay the neutral booked colour.
const rentMarks = { OVERDUE: { className: ' is-owed is-overdue', label: ', rent overdue' }, DUE: { className: ' is-owed is-due', label: ', rent due this month' } } as const

/**
 * A booked bed, coloured by its occupant's rent: hovering or focusing it shows who is in it (BedOccupantCard),
 * so it can be tabbed to. A bed booked by a resident without a bed number has no one to show, so it stays a
 * plain neutral marker.
 */
function BookedBed({ bed, occupant, onShow, onHide }: { bed: number; occupant: BedOccupant | undefined; onShow: (occupant: BedOccupant, anchor: DOMRect) => void; onHide: () => void }) {
  if (!occupant) return <i className="is-taken" role="img" aria-label={`Bed ${bed}, booked`}>{bed}</i>
  const mark = occupant.rent?.state === 'OVERDUE' || occupant.rent?.state === 'DUE' ? rentMarks[occupant.rent.state] : null
  const show = (target: Element) => onShow(occupant, target.getBoundingClientRect())
  return <i className={`is-taken is-occupied${mark?.className ?? ''}`} role="img" tabIndex={0} aria-label={`Bed ${bed}, booked by ${occupant.name}${mark?.label ?? ''}`} onMouseEnter={(event) => show(event.currentTarget)} onFocus={(event) => show(event.currentTarget)} onMouseLeave={onHide} onBlur={onHide}>{bed}</i>
}
