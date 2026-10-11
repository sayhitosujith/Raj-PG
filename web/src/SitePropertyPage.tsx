import { ArrowLeft, Building2, CalendarClock, Clock, DoorOpen, LogIn, LogOut, MoonStar, Users, WalletCards } from 'lucide-react'
import { formatClock, formatMealWindow, mealDetails } from './meals'
import { tenantHint } from './propertyFeatureOptions'
import { formatRupees } from './rent'
import { sitePaths } from './router'
import type { SiteData } from './siteData'
import { SiteLink } from './SiteLink'
import { AmenityChips, FreeBeds, PriceTable, PropertyAddress, SiteHeading } from './SiteParts'

/** One property's page: photos, prices by sharing type, amenities, timings and the way to book. */
export function SitePropertyPage({ site, propertyId }: { site: SiteData; propertyId: string }) {
  const property = site.properties.find((item) => item.id === propertyId)
  if (!property) {
    return (
      <section className="site-section site-not-found">
        <Building2 size={36} aria-hidden="true" />
        <h1>We could not find that PG</h1>
        <p>It may have been renamed or removed.</p>
        <SiteLink to={sitePaths.properties} className="primary-button site-cta">See all our PGs</SiteLink>
      </section>
    )
  }
  const photos = [...(property.image ? [{ id: 'cover', caption: property.name, url: property.image }] : []), ...property.photos]
  const forWhom = tenantHint(property.tenantType)
  const { houseRules } = site
  const timings = [
    property.checkInTime && { icon: LogIn, label: 'Check-in', value: formatClock(property.checkInTime, true) },
    property.checkOutTime && { icon: LogOut, label: 'Check-out', value: formatClock(property.checkOutTime, true) },
    property.gateClosingTime && { icon: DoorOpen, label: 'Gate closes', value: formatClock(property.gateClosingTime, true) },
    { icon: Users, label: 'Visiting hours', value: houseRules.visitingHours },
    { icon: MoonStar, label: 'Quiet hours', value: houseRules.quietHours },
    { icon: CalendarClock, label: 'Notice to move out', value: property.noticePeriodDays ? `${property.noticePeriodDays} days` : 'Not required' },
    houseRules.securityDeposit && { icon: WalletCards, label: 'Security deposit', value: formatRupees(houseRules.securityDeposit) },
  ].filter((item): item is { icon: typeof Clock; label: string; value: string } => Boolean(item))

  return (
    <>
      <section className="site-section site-property-head">
        <SiteLink to={sitePaths.properties} className="site-back"><ArrowLeft size={15} aria-hidden="true" /> All PGs</SiteLink>
        <h1>{property.name}</h1>
        <p className="site-meta">
          {forWhom && <span><Users size={14} aria-hidden="true" /> {forWhom}</span>}
          <PropertyAddress property={property} />
          <FreeBeds property={property} />
        </p>
        {photos.length > 0 && (
          // The first photo large, the rest beside it; each opens full size in a new tab.
          <div className={`site-gallery${photos.length === 1 ? ' is-single' : ''}`}>
            {photos.slice(0, 5).map((photo, index) => <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" className={index === 0 ? 'is-main' : undefined}><img src={photo.url} alt={photo.caption ?? `${property.name} photo ${index + 1}`} loading={index ? 'lazy' : 'eager'} /></a>)}
          </div>
        )}
      </section>

      <div className="site-property-layout">
        <div className="site-property-main">
          <section className="site-section">
            <SiteHeading eyebrow="Rent" title="Monthly prices" lead="Rent depends on how many share the room, and whether you take the food plan." />
            <PriceTable property={property} />
          </section>
          {property.amenities.length > 0 && (
            <section className="site-section">
              <SiteHeading eyebrow="Amenities" title="What's included" />
              <AmenityChips amenities={property.amenities} />
            </section>
          )}
          <section className="site-section">
            <SiteHeading eyebrow="Food" title="Meal timings" />
            <ul className="site-meal-times">{mealDetails.map(({ meal, label, icon: Icon }) => <li key={meal}><Icon size={18} aria-hidden="true" /><strong>{label}</strong><span>{formatMealWindow(property.mealTimes[meal])}</span></li>)}</ul>
            <SiteLink to={sitePaths.foodAndRules} className="site-text-link">See the weekly menu</SiteLink>
          </section>
          <section className="site-section">
            <SiteHeading eyebrow="Good to know" title="Timings and house rules" />
            <ul className="site-facts">{timings.map(({ icon: Icon, label, value }) => <li key={label}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></li>)}</ul>
          </section>
        </div>
        <aside className="site-book-card">
          <h2>Interested in {property.name}?</h2>
          <p>{property.freeBeds ? 'Beds are free right now. Book a visit and we will show you around.' : 'It is full right now, but beds open up often. Send a request and we will let you know.'}</p>
          <SiteLink to={sitePaths.bookVisit} className="primary-button site-cta">Book a visit</SiteLink>
          {site.contactPhone && <a className="secondary-button site-cta" href={`tel:${site.contactPhone}`}>Call {site.contactPhone}</a>}
        </aside>
      </div>
    </>
  )
}
