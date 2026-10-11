import { BedDouble, Building2, MapPin, Users } from 'lucide-react'
import { amenityOptions, tenantHint } from './propertyFeatureOptions'
import { formatRupees } from './rent'
import { sharingLabel } from './rooms'
import { sitePaths } from './router'
import { startingPrice, type SiteProperty } from './siteData'
import { SiteLink } from './SiteLink'

/** A section's eyebrow, title and lead line, the same on every page. */
export function SiteHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return <div className="site-heading"><p className="site-eyebrow">{eyebrow}</p><h2>{title}</h2>{lead && <p>{lead}</p>}</div>
}

/** "Free beds" as a badge: how many, or that the property is full right now. */
export function FreeBeds({ property }: { property: SiteProperty }) {
  if (!property.totalBeds) return null
  return <span className={`site-badge${property.freeBeds ? ' is-free' : ' is-full'}`}><BedDouble size={13} aria-hidden="true" /> {property.freeBeds ? `${property.freeBeds} ${property.freeBeds === 1 ? 'bed' : 'beds'} free` : 'Full right now'}</span>
}

/** The amenities a property offers, with their icons. */
export function AmenityChips({ amenities }: { amenities: string[] }) {
  const offered = amenityOptions.filter((option) => amenities.includes(option.value))
  if (!offered.length) return null
  return <ul className="site-amenities">{offered.map(({ value, label, icon: Icon }) => <li key={value}><Icon size={15} aria-hidden="true" /> {label}</li>)}</ul>
}

/** A property as a card linking to its page: photo, name, who it is for, area, starting price and free beds. */
export function PropertyCard({ property }: { property: SiteProperty }) {
  const from = startingPrice(property)
  const forWhom = tenantHint(property.tenantType)
  return (
    <SiteLink to={sitePaths.property(property.id)} className="site-property-card">
      <div className="site-property-photo">{property.image ? <img src={property.image} alt="" loading="lazy" /> : <Building2 size={40} aria-hidden="true" />}<FreeBeds property={property} /></div>
      <div className="site-property-body">
        <h3>{property.name}</h3>
        <p className="site-meta">{forWhom && <span><Users size={13} aria-hidden="true" /> {forWhom}</span>}{property.city && <span><MapPin size={13} aria-hidden="true" /> {property.city}</span>}</p>
        <AmenityChips amenities={property.amenities.slice(0, 4)} />
        <p className="site-price">{from ? <>From <strong>{formatRupees(from)}</strong> / month</> : 'Ask us for prices'}</p>
      </div>
    </SiteLink>
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
