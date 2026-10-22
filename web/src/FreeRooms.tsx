import { useState } from 'react'
import { BedOccupantCard, type BedOccupant } from './BedOccupantCard'

/**
 * One set-up room at a property, as the Overview's room grid receives it: its beds, the bed numbers that
 * are booked and who is in each, and residents in it without a bed number yet (they still use a bed).
 */
export type RoomOccupancy = { number: string; beds: number; bookedBeds: number[]; occupants: BedOccupant[]; unassigned: number }

// Every room is shown; this only guards against an extreme property, past which the grid ends with "+N more rooms".
const shownRooms = 300

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Which bed numbers in a room are free; residents without a bed number use up free beds from the end. */
function freeBedsOf(room: RoomOccupancy) {
  const booked = new Set(room.bookedBeds)
  const free = Array.from({ length: room.beds }, (_, index) => index + 1).filter((bed) => !booked.has(bed))
  return free.slice(0, Math.max(0, free.length - room.unassigned))
}

/**
 * The Overview tip's room grid: a hero number and a meter for the property's free beds against its total,
 * then every room as a small tile with its number and its beds numbered 1 to N: free beds green and round,
 * booked beds red and square (shape as well as colour), so the owner sees exactly which beds are free.
 * Rooms with a free bed are outlined green, fully booked ones red. Hover a booked bed to see who is in it
 * (BedOccupantCard), or a free bed for its "add a resident" hint. Every room is shown, row after row. Each free bed is a button that starts
 * "Add resident" in that room and bed (`onAddResident`). Every bed is labelled for screen readers ("Bed 3,
 * free"), so nothing depends on colour or hover. Colours were checked with the dataviz palette validator
 * against the card's light and dark surfaces.
 */
export function FreeRooms({ beds, rooms, notSetUp, onAddResident }: { beds: { taken: number; total: number }; rooms: RoomOccupancy[]; notSetUp: number; onAddResident: (roomNumber: string, bed: number) => void }) {
  // The booked bed being hovered or focused, with where it is on screen, for its resident card.
  const [shownOccupant, setShownOccupant] = useState<{ occupant: BedOccupant; roomNumber: string; anchor: DOMRect } | null>(null)
  const free = Math.max(0, beds.total - beds.taken)
  if (!beds.total) return null
  const shown = rooms.slice(0, shownRooms)
  const hidden = rooms.length - shown.length
  const withFree = rooms.map((room) => ({ room, free: freeBedsOf(room) }))
  const roomsWithSpace = withFree.filter((entry) => entry.free.length > 0).length
  const unassigned = rooms.reduce((sum, room) => sum + room.unassigned, 0)
  const takenShare = (beds.taken / beds.total) * 100
  return (
    <figure className="free-chart">
      <figcaption className="free-chart-head"><strong className="free-chart-hero">{free}</strong> {free === 1 ? 'bed' : 'beds'} free <span>of {beds.total}{rooms.length ? ` · ${roomsWithSpace} of ${plural(rooms.length, 'room')} have space` : ''}</span></figcaption>
      <div className="free-meter" aria-hidden="true">
        {beds.taken > 0 && <span className="is-taken" style={{ width: `${takenShare}%` }} />}
        {free > 0 && <span className="is-free" style={{ width: `${100 - takenShare}%` }} />}
      </div>
      <ul className="free-legend" aria-hidden="true"><li><i className="is-free" />Free bed</li><li><i className="is-taken" />Booked bed</li></ul>
      {shown.length > 0 && <ul className="room-grid" aria-label="Rooms and beds; choose a free bed to add a resident to it">
        {withFree.slice(0, shownRooms).map(({ room, free: freeBeds }) => (
          <li key={room.number} className={`room-tile${freeBeds.length ? ' has-space' : ' is-full'}`}>
            <span className="room-tile-number"><span className="sr-only">Room </span>{room.number}</span>
            <span className="room-tile-beds">{Array.from({ length: room.beds }, (_, index) => {
              const bed = index + 1
              return freeBeds.includes(bed)
                ? <button key={bed} type="button" className="is-free" aria-label={`Bed ${bed}, free: add a resident`} title={`Add a resident to room ${room.number}, bed ${bed}`} onClick={() => onAddResident(room.number, bed)}>{bed}</button>
                : <BookedBed key={bed} bed={bed} occupant={room.occupants.find((occupant) => occupant.bed === bed)} onShow={(occupant, anchor) => setShownOccupant({ occupant, roomNumber: room.number, anchor })} onHide={() => setShownOccupant(null)} />
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

/**
 * A booked bed: hovering or focusing it shows who is in it (BedOccupantCard), so it can be tabbed to. A bed
 * booked by a resident without a bed number has no one to show, so it stays a plain marker.
 */
function BookedBed({ bed, occupant, onShow, onHide }: { bed: number; occupant: BedOccupant | undefined; onShow: (occupant: BedOccupant, anchor: DOMRect) => void; onHide: () => void }) {
  if (!occupant) return <i className="is-taken" role="img" aria-label={`Bed ${bed}, booked`}>{bed}</i>
  const show = (target: Element) => onShow(occupant, target.getBoundingClientRect())
  return <i className="is-taken is-occupied" role="img" tabIndex={0} aria-label={`Bed ${bed}, booked by ${occupant.name}`} onMouseEnter={(event) => show(event.currentTarget)} onFocus={(event) => show(event.currentTarget)} onMouseLeave={onHide} onBlur={onHide}>{bed}</i>
}
