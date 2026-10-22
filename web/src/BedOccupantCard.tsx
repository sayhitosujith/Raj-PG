import { Avatar } from './Avatar'
import { displayName } from './displayName'
import { daysStayedLabel, formatJoinDate } from './joinDate'
import { ModalLayer } from './ModalLayer'
import { formatRupees } from './rent'

/** The next rent date: overdue (since the oldest unpaid due date), due this month, or the first unpaid month ahead. */
export type RentDue = { state: 'OVERDUE' | 'DUE' | 'UPCOMING'; dueDate: string; amount: number }

/** The resident in a booked bed, as the Overview's room grid receives them; `rent` is null when rent is not tracked. */
export type BedOccupant = { bed: number; id: string; name: string; phone: string | null; joinedAt: string; photoVersion: number | null; rent: RentDue | null }

function rentLine(rent: RentDue) {
  const date = formatJoinDate(rent.dueDate)
  if (rent.state === 'OVERDUE') return `Rent overdue since ${date} · ${formatRupees(rent.amount)} owed`
  return `${rent.state === 'DUE' ? 'Rent due' : 'Paid · next due'} ${date} · ${formatRupees(rent.amount)}`
}

const cardWidth = 230
// Roughly the card's tallest (five lines), to decide whether it fits below the bed.
const cardHeight = 150
const gap = 8

/**
 * Who is in a booked bed, shown while the bed is hovered or focused on the Overview's room grid: photo
 * (or initials), name, room and bed, phone, joining date and when rent is next due (red when overdue).
 * Rendered at the top of the page (ModalLayer) and placed by the bed's on-screen position, because the grid
 * scrolls inside a card and cards are CSS containers, either of which would clip a popover drawn in place.
 * Kept inside the window's edges.
 */
export function BedOccupantCard({ occupant, roomNumber, anchor }: { occupant: BedOccupant; roomNumber: string; anchor: DOMRect }) {
  const left = Math.min(Math.max(gap, anchor.left + anchor.width / 2 - cardWidth / 2), window.innerWidth - cardWidth - gap)
  // Below the bed, or above it when there is no room underneath.
  const below = anchor.bottom + gap + cardHeight < window.innerHeight
  const style = below ? { left, top: anchor.bottom + gap } : { left, bottom: window.innerHeight - anchor.top + gap }
  return (
    <ModalLayer>
      <div className="bed-occupant-card" role="tooltip" style={{ ...style, width: cardWidth }}>
        <Avatar name={occupant.name} photoUrl={occupant.photoVersion ? `/api/residents/${occupant.id}/photo?v=${occupant.photoVersion}` : null} className="bed-occupant-photo" />
        <div className="bed-occupant-text">
          <strong>{displayName(occupant.name)}</strong>
          <small>Room {roomNumber} · Bed {occupant.bed}</small>
          {occupant.phone && <small>{occupant.phone}</small>}
          <small>Joined {formatJoinDate(occupant.joinedAt)} · {daysStayedLabel(occupant.joinedAt)}</small>
          {occupant.rent && <small className={`bed-occupant-rent${occupant.rent.state === 'OVERDUE' ? ' is-overdue' : ''}`}>{rentLine(occupant.rent)}</small>}
        </div>
      </div>
    </ModalLayer>
  )
}
