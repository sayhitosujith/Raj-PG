import { BedDouble, Building2, Globe, MapPin, Users } from 'lucide-react'
import { amenityOptions, tenantHint } from './propertyFeatureOptions'
import { formatRupees } from './rent'
import { sharingLabel } from './rooms'
import { sitePaths } from './router'
import { addressOf, mapLinkOf, startingPrice, type SiteProperty } from './siteData'
import { SiteLink } from './SiteLink'

/** A section's eyebrow, title and lead line, the same on every page. */
export function SiteHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return <div className="site-heading"><p className="site-eyebrow">{eyebrow}</p><h2>{title}</h2>{lead && <p>{lead}</p>}</div>
}

/**
 * A property's full address as a map link: the owner's own map link when they pasted one, otherwise a
 * map search for the address. Not for use inside another link (a property card shows plain text).
 */
export function PropertyAddress({ property }: { property: SiteProperty }) {
  const address = addressOf(property)
  const href = mapLinkOf(property) ?? (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.name}, ${address}`)}` : null)
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
  const offered = amenityOptions.filter((option) => amenities.includes(option.value))
  if (!offered.length) return null
  return <ul className="site-amenities">{offered.map(({ value, label, icon: Icon }) => <li key={value}><Icon size={15} aria-hidden="true" /> {label}</li>)}</ul>
}

/** A property as a card linking to its page: photo, name, who it is for, area, starting price and free beds. */
export function PropertyCard({ property }: { property: SiteProperty }) {
  const from = startingPrice(property)
  const forWhom = tenantHint(property.tenantType)
  // The name's link stretches over the whole card (see .site-property-link in site.css), so the card stays
  // one big click target while the PG's own website link sits on top and opens on its own.
  return (
    <article className="site-property-card">
      <div className="site-property-photo">{property.image ? <img src={property.image} alt="" loading="lazy" /> : <Building2 size={40} aria-hidden="true" />}<FreeBeds property={property} /></div>
      <div className="site-property-body">
        <h3><SiteLink to={sitePaths.property(property.id)} className="site-property-link">{property.name}</SiteLink></h3>
        <p className="site-meta">{forWhom && <span><Users size={13} aria-hidden="true" /> {forWhom}</span>}{addressOf(property) && <span><MapPin size={13} aria-hidden="true" /> {addressOf(property)}</span>}</p>
        <AmenityChips amenities={property.amenities} />
        <p className="site-price">{from ? <>From <strong>{formatRupees(from)}</strong> / month</> : 'Ask us for prices'}</p>
        {property.websiteUrl && <a className="site-property-website" href={property.websiteUrl} target="_blank" rel="noopener noreferrer" title={property.websiteUrl}><Globe size={14} aria-hidden="true" /> {websiteLabel(property.websiteUrl)}</a>}
      </div>
    </article>
  )
}

/** "yourpg.com" from "https://www.yourpg.com/rooms": the short name a card shows for a website link. */
function websiteLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
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
