import type { ReactNode } from 'react'
import { Building2, Nfc } from 'lucide-react'
import { rentPaidThrough, type RentSummary } from './rent'
import { sharingLabel } from './rooms'

/** "2027-02-28" as "28-02-2027", the way cards print dates. */
const cardDate = (date: string) => date.split('-').reverse().join('-')

/**
 * The resident's Home card, laid out like a membership card: the PG and its sharing as the tier, a
 * chip, how long paid rent lasts ("Valid thru", or "Rent due" while rent is owed), the membership ID,
 * the cardholder (with `tags`, their occupation and diet) and their room and bed. It sits on the blue
 * Home heading, which gives it its background. The chip and contactless mark are decoration only,
 * hidden from screen readers.
 */
export function MemberCard({ property, membershipId, name, room, bed, roomBeds, rent, tags }: { property: string; membershipId: string; name: string; room: string; /** Shown under the room once staff have assigned one. */ bed?: number | null; roomBeds?: number; rent: RentSummary; tags?: ReactNode }) {
  const paidThrough = rentPaidThrough(rent)
  return (
    <div className="member-card">
      <div className="member-card-top">
        <span className="member-card-badge" aria-hidden="true"><Building2 size={16} /></span>
        <p className="member-card-brand" title={property}><strong>{property}</strong><small>Resident card</small></p>
        <Nfc className="member-card-nfc" size={18} aria-hidden="true" />
        {roomBeds ? <span className="member-card-pill">{sharingLabel(roomBeds)}</span> : null}
      </div>
      <div className="member-card-row">
        <span className="member-card-chip" aria-hidden="true" />
        {paidThrough && <p className="member-card-field is-end"><span>Valid thru</span>{paidThrough === 'due' ? <strong className="member-card-due">Rent due</strong> : <strong>{cardDate(paidThrough)}</strong>}</p>}
      </div>
      <p className="member-card-field"><span>Membership ID</span><strong className="member-card-id">{membershipId}</strong></p>
      <div className="member-card-row member-card-foot">
        <div className="member-card-field"><span>Cardholder</span><strong>{name}</strong>{tags}</div>
        <p className="member-card-field is-end"><span>Unit</span><strong>Room {room}</strong>{bed ? <strong>Bed {bed}</strong> : null}</p>
      </div>
    </div>
  )
}
