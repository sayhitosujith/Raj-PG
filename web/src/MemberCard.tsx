import type { ReactNode } from 'react'
import { Nfc } from 'lucide-react'
import { rentPaidThrough, type RentSummary } from './rent'
import { sharingLabel } from './rooms'

/** "2027-02-28" as "28-02-2027", the way cards print dates. */
const cardDate = (date: string) => date.split('-').reverse().join('-')

/**
 * The resident's Home card, laid out like a membership card: the PG (with its GSTIN under the title
 * when it has one) and its sharing as the tier, "Resident card" in the bottom corner, a chip, how long paid rent lasts ("Valid thru", or "Rent due" while rent is owed), the membership ID,
 * the cardholder (with `tags`, their occupation and diet), their age when known, and their room and bed. It sits on the blue
 * Home heading, which gives it its background. The chip and contactless mark are decoration only,
 * hidden from screen readers.
 */
export function MemberCard({ property, gstNumber, membershipId, name, age, room, bed, roomBeds, rent, tags }: { property: string; /** The property's GSTIN, printed under the card title when it has one. */ gstNumber?: string | null; membershipId: string; name: string; /** Whole years, from the date of birth; the Age field is left out when unknown. */ age?: number | null; room: string; /** Shown under the room once staff have assigned one. */ bed?: number | null; roomBeds?: number; rent: RentSummary; tags?: ReactNode }) {
  const paidThrough = rentPaidThrough(rent)
  return (
    <div className="member-card">
      <div className="member-card-top">
        <p className="member-card-brand" title={property}><strong>{property}</strong>{gstNumber && <small className="member-card-gst">GSTIN {gstNumber}</small>}</p>
        <Nfc className="member-card-nfc" size={18} aria-hidden="true" />
        {roomBeds ? <span className="member-card-pill">{sharingLabel(roomBeds)}</span> : null}
      </div>
      {/* Chip, membership ID and validity share one row, which keeps the card short. */}
      <div className="member-card-row member-card-mid">
        <span className="member-card-chip" aria-hidden="true" />
        <p className="member-card-field member-card-id-field"><span>Membership ID</span><strong className="member-card-id">{membershipId}</strong></p>
        {paidThrough && <p className="member-card-field is-end"><span>Valid thru</span>{paidThrough === 'due' ? <strong className="member-card-due">Rent due</strong> : <strong>{cardDate(paidThrough)}</strong>}</p>}
      </div>
      <div className="member-card-row member-card-foot">
        <div className="member-card-field"><span>Cardholder</span><strong>{name}</strong></div>
        {age !== null && age !== undefined ? <div className="member-card-field member-card-age"><span>Age</span><strong>{age} {age === 1 ? 'year' : 'years'}</strong></div> : null}
        <p className="member-card-field is-end"><span>Unit</span><strong>Room {room}</strong>{bed ? <strong>Bed {bed}</strong> : null}</p>
        {/* A second row: the tags on the left and "Resident card" on the right share one bottom line,
            however many lines the tags take, so the label never ends up on a row of its own. */}
        <div className="member-card-tags">{tags}</div>
        <small className="member-card-kind">Resident card</small>
      </div>
    </div>
  )
}
