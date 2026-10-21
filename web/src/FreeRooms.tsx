/**
 * One set-up room at a property, as the Overview's room grid receives it: its beds, the bed numbers that
 * are booked, and residents in it without a bed number yet (they still use a bed).
 */
export type RoomOccupancy = { number: string; beds: number; bookedBeds: number[]; unassigned: number }

// The grid scrolls inside the card, so it can hold every room of a large PG; past this it ends with "+N more rooms".
const shownRooms = 300

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
const bedList = (beds: number[]) => beds.length ? `${beds.length === 1 ? 'bed' : 'beds'} ${beds.join(', ')}` : 'none'

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
 * Rooms with a free bed are outlined green, fully booked ones red. Hover a tile for its free bed numbers
 * (the browser's own tooltip, which the scrolling grid cannot clip). The grid scrolls inside the card past
 * about three rows, so a large PG does not stretch the Overview. Each free bed is a button that starts
 * "Add resident" in that room and bed (`onAddResident`). Every bed is labelled for screen readers ("Bed 3,
 * free"), so nothing depends on colour or hover. Colours were checked with the dataviz palette validator
 * against the card's light and dark surfaces.
 */
export function FreeRooms({ beds, rooms, notSetUp, onAddResident }: { beds: { taken: number; total: number }; rooms: RoomOccupancy[]; notSetUp: number; onAddResident: (roomNumber: string, bed: number) => void }) {
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
          <li key={room.number} className={`room-tile${freeBeds.length ? ' has-space' : ' is-full'}`} title={`Room ${room.number} · ${freeBeds.length ? `Free: ${bedList(freeBeds)}` : 'Fully booked'}`}>
            <span className="room-tile-number"><span className="sr-only">Room </span>{room.number}</span>
            <span className="room-tile-beds">{Array.from({ length: room.beds }, (_, index) => {
              const bed = index + 1
              return freeBeds.includes(bed)
                ? <button key={bed} type="button" className="is-free" aria-label={`Bed ${bed}, free: add a resident`} title={`Add a resident to room ${room.number}, bed ${bed}`} onClick={() => onAddResident(room.number, bed)}>{bed}</button>
                : <i key={bed} className="is-taken" role="img" aria-label={`Bed ${bed}, booked`}>{bed}</i>
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
    </figure>
  )
}
