import { BedDouble, Building2, MapPin, Phone, Users } from 'lucide-react'
import { PhoneText } from './PhoneField'
import { amenityItems, tenantHint } from './propertyFeatureOptions'
import { formatRupees } from './rent'
import { sharingLabel } from './rooms'
import { sitePaths } from './router'
import { addressOf, mapLinkOf, startingPrice, whatsappLink, type SiteProperty } from './siteData'
import { WhatsAppIcon } from './WhatsAppIcon'
import { SiteLink } from './SiteLink'

/** A section's eyebrow, title and lead line, the same on every page. */
export function SiteHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return <div className="site-heading"><p className="site-eyebrow">{eyebrow}</p><h2>{title}</h2>{lead && <p>{lead}</p>}</div>
}

/** Where a property opens on a map: the owner's own map link when they pasted one, otherwise a map search for its address; null with neither. */
function mapHrefOf(property: SiteProperty) {
  const address = addressOf(property)
  return mapLinkOf(property) ?? (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.name}, ${address}`)}` : null)
}

/** A property's full address as a map link, for its own page. */
export function PropertyAddress({ property }: { property: SiteProperty }) {
  const address = addressOf(property)
  const href = mapHrefOf(property)
  if (!href) return null
  return <a className="site-location" href={href} target="_blank" rel="noopener noreferrer" title="Open in Google Maps"><MapPin size={14} aria-hidden="true" /> {address || 'Open map'}</a>
}

/** "Free beds" as a badge: how many, or that the property is full right now. */
export function FreeBeds({ property }: { property: SiteProperty }) {
  if (!property.totalBeds) return null
  return <span className={`site-badge${property.freeBeds ? ' is-free' : ' is-full'}`}><BedDouble size={13} aria-hidden="true" /> {property.freeBeds ? `${property.freeBeds} ${property.freeBeds === 1 ? 'bed' : 'beds'} free` : 'Full right now'}</span>
}

/** The amenities a property offers, with their icons. */
export function AmenityChips({ amenities }: { amenities: string[] }) {
  const offered = amenityItems(amenities)
  if (!offered.length) return null
  return <ul className="site-amenities">{offered.map(({ value, label, icon: Icon }) => <li key={value}><Icon size={15} aria-hidden="true" /> {label}</li>)}</ul>
}

/** A property as a card linking to its page: photo, name, who it is for, area, starting price and free beds. */
export function PropertyCard({ property }: { property: SiteProperty }) {
  const from = startingPrice(property)
  const forWhom = tenantHint(property.tenantType)
  // The name's link stretches over the whole card (see .site-property-link in site.css), so the card stays
  // one big click target while its manager's number sits on top: a call link, with a WhatsApp chat (opened with
  // the PG named) on the right. The PG's website and map link are on its own page.
  return (
    <article className="site-property-card">
      <div className="site-property-photo">{property.image ? <img src={property.image} alt="" loading="lazy" /> : <Building2 size={40} aria-hidden="true" />}<FreeBeds property={property} /></div>
      <div className="site-property-body">
        <h3><SiteLink to={sitePaths.property(property.id)} className="site-property-link">{property.name}</SiteLink></h3>
        <p className="site-meta">{forWhom && <span><Users size={13} aria-hidden="true" /> {forWhom}</span>}{addressOf(property) && <span><MapPin size={13} aria-hidden="true" /> {addressOf(property)}</span>}</p>
        <AmenityChips amenities={property.amenities} />
        <p className="site-price">{from ? <>From <strong>{formatRupees(from)}</strong> / month</> : 'Ask us for prices'}</p>
        {property.managerPhone && <div className="site-property-contact">
          <a className="site-property-call" href={`tel:${property.managerPhone}`} title="Call the manager"><Phone size={14} aria-hidden="true" /> <PhoneText value={property.managerPhone} /></a>
          <a className="site-property-whatsapp" href={whatsappLink(property.managerPhone, `Hi, I'm interested in ${property.name}.`)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp the manager of ${property.name}`} title="WhatsApp the manager"><WhatsAppIcon size={18} /></a>
        </div>}
      </div>
    </article>
  )
}

/**
 * A property's monthly rents: the standard pair, then each sharing type with its own price. Nothing
 * when the property sets no prices (the owner prices each resident instead).
 */
export function PriceTable({ property }: { property: SiteProperty }) {
  const rows = [
    ...(property.rentWithFood && property.rentWithoutFood ? [{ key: 'standard', label: property.sharingPrices.length ? 'Other rooms' : 'All rooms', withFood: property.rentWithFood, withoutFood: property.rentWithoutFood }] : []),
    ...property.sharingPrices.map((price) => ({ key: String(price.beds), label: sharingLabel(price.beds), withFood: price.rentWithFood, withoutFood: price.rentWithoutFood })),
  ]
  if (!rows.length) return <p className="site-muted">Prices depend on the room. Contact us and we will share the options.</p>
  // Sharing types first (Single, 2 sharing…), the standard price for everything else last.
  const ordered = [...rows.filter((row) => row.key !== 'standard'), ...rows.filter((row) => row.key === 'standard')]
  return (
    <table className="site-price-table">
      <thead><tr><th scope="col">Room</th><th scope="col">With food</th><th scope="col">Without food</th></tr></thead>
      <tbody>{ordered.map((row) => <tr key={row.key}><th scope="row">{row.label}</th><td>{formatRupees(row.withFood)}</td><td>{formatRupees(row.withoutFood)}</td></tr>)}</tbody>
    </table>
  )
}
