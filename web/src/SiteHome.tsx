import { useState } from 'react'
import { BadgeCheck, CalendarCheck, Home, KeyRound, MapPin, MessageCircle, Phone, ShieldCheck, Sparkles, UtensilsCrossed, Wrench } from 'lucide-react'
import { amenityOptions } from './propertyFeatureOptions'
import { formatRupees } from './rent'
import { sharingLabel } from './rooms'
import { sitePaths } from './router'
import { locationOf, locationsOf, photosOf, roomOptionsOf, startingPrice, unknownLocation, whatsappLink, type SiteData } from './siteData'
import { defaultAboutPoints, defaultAboutText, defaultAboutTitle, defaultHeadline, defaultPerks, defaultTagline, isShown } from './siteContent'
import { SiteCarousel } from './SiteCarousel'
import { SiteCounter } from './SiteCounter'
import { SiteHero } from './SiteHero'
import { SiteLink } from './SiteLink'
import { AmenityChips, PropertyCard, SiteHeading } from './SiteParts'

// The "Why stay with us" cards' icons, in card order (the owner edits only their text).
const perkIcons = [UtensilsCrossed, Sparkles, Wrench, ShieldCheck]

const steps = [
  { icon: MessageCircle, title: 'Tell us what you need', text: 'Send a request with your move-in date and budget.' },
  { icon: CalendarCheck, title: 'Visit the PG', text: 'We call you back, usually the same day, and show you around.' },
  { icon: KeyRound, title: 'Move in', text: 'Sign in to the resident app for rent, meals and requests.' },
]

const galleryPhotoCount = 8

/**
 * The website's home page, laid out like a hospitality site: a full-screen gradient hero, about with
 * live counters, locations, the PGs as a carousel, room options like plan cards, why stay with us, a
 * photo gallery, how joining works and a get-in-touch band. Everything comes from live data; the text
 * is the owner's from the admin Website page where they wrote it, built-in otherwise, and the sections
 * they turned off are left out.
 */
export function SiteHome({ site }: { site: SiteData }) {
  const { properties, content } = site
  // '' shows every location; a name shows only the PGs there.
  const [location, setLocation] = useState('')
  const locations = locationsOf(properties)
  const cities = locations.map((area) => area.name).filter((name) => name !== unknownLocation)
  const shown = location ? properties.filter((property) => locationOf(property) === location) : properties
  const prices = properties.map(startingPrice).filter((price): price is number => price !== null)
  const freeBeds = properties.reduce((sum, property) => sum + property.freeBeds, 0)
  const totalBeds = properties.reduce((sum, property) => sum + property.totalBeds, 0)
  const amenities = amenityOptions.map((option) => option.value).filter((value) => properties.some((property) => property.amenities.includes(value)))
  const photos = photosOf(properties)
  const aboutPhoto = photos[0]
  const roomOptions = roomOptionsOf(properties)
  const bestValue = roomOptions.length > 1 ? roomOptions.reduce((best, option) => option.withoutFood < best.withoutFood ? option : best).beds : null
  const facts = { businessName: site.businessName, cities, propertyCount: properties.length, lowestPrice: prices.length ? Math.min(...prices) : null }
  const perks = (content.perks ?? defaultPerks).map((card, index) => ({ ...card, icon: perkIcons[index % perkIcons.length] }))

  // A location card filters the PGs and brings them into view.
  function showLocation(name: string) {
    setLocation(name)
    document.getElementById('properties')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <SiteHero image={site.bannerUrl}>
        <p className="site-eyebrow">{site.businessName}</p>
        <h1>{content.headline ?? defaultHeadline}</h1>
        <p className="site-lead">{content.tagline ?? defaultTagline(facts)}</p>
        <div className="site-actions">
          <SiteLink to={sitePaths.properties} className="primary-button site-cta">View PGs</SiteLink>
          <SiteLink to={sitePaths.bookVisit} className="secondary-button site-cta">Enquire now</SiteLink>
        </div>
      </SiteHero>

      <section className="site-section site-about" id="about">
        <div className="site-about-photo">{aboutPhoto ? <img src={aboutPhoto.url} alt="" loading="lazy" /> : <Home size={48} aria-hidden="true" />}</div>
        <div className="site-about-copy">
          <SiteHeading eyebrow={`About ${site.businessName}`} title={content.aboutTitle ?? defaultAboutTitle} lead={content.aboutText ?? defaultAboutText(facts)} />
          <ul className="site-about-points">{(content.aboutPoints ?? defaultAboutPoints).map((point) => <li key={point}><BadgeCheck size={18} aria-hidden="true" /> {point}</li>)}</ul>
          <div className="site-counters">
            <SiteCounter value={properties.length} label={properties.length === 1 ? 'PG' : 'PGs'} />
            <SiteCounter value={Math.max(cities.length, 1)} label={cities.length === 1 ? 'Location' : 'Locations'} />
            {totalBeds > 0 && <SiteCounter value={totalBeds} label="Beds" />}
            {amenities.length > 0 && <SiteCounter value={amenities.length} label="Amenities" />}
          </div>
        </div>
      </section>

      {locations.length > 0 && isShown(content, 'locations') && (
        <section className="site-section" id="locations">
          <SiteHeading eyebrow="Available locations" title="Where you can stay" lead="Pick an area to see the PGs there." />
          <ul className="site-locations">{locations.map((area) => (
            <li key={area.name}>
              <button type="button" className={`site-location-card${location === area.name ? ' is-selected' : ''}`} aria-pressed={location === area.name} onClick={() => showLocation(area.name)}>
                <span className="site-icon"><MapPin size={20} aria-hidden="true" /></span>
                <strong>{area.name}</strong>
                <span className="site-location-detail">{area.properties.length} {area.properties.length === 1 ? 'PG' : 'PGs'} · {area.freeBeds ? `${area.freeBeds} ${area.freeBeds === 1 ? 'bed' : 'beds'} free` : 'Full right now'}</span>
                <span className="site-location-detail">{area.from ? <>From <b>{formatRupees(area.from)}</b> / month</> : 'Ask us for prices'}</span>
              </button>
            </li>
          ))}</ul>
        </section>
      )}

      <section className="site-section" id="properties">
        <SiteHeading eyebrow="Featured" title="Our PGs" lead={freeBeds ? `${freeBeds} ${freeBeds === 1 ? 'bed is' : 'beds are'} free right now. Live prices and availability.` : 'Live prices and availability, straight from our records.'} />
        {locations.length > 1 && isShown(content, 'locations') && (
          <div className="site-filter" role="group" aria-label="Filter by location">
            {['', ...locations.map((area) => area.name)].map((name) => <button key={name || 'all'} type="button" className={`site-filter-chip${location === name ? ' is-selected' : ''}`} aria-pressed={location === name} onClick={() => setLocation(name)}>{name || 'All locations'}</button>)}
          </div>
        )}
        {properties.length
          ? <SiteCarousel label="Our PGs" items={shown.map((property) => ({ key: property.id, content: <PropertyCard property={property} /> }))} />
          : <p className="site-muted"><Home size={16} aria-hidden="true" /> Our properties will be listed here soon.</p>}
      </section>

      {roomOptions.length > 0 && isShown(content, 'roomOptions') && (
        <section className="site-section site-band" id="rooms">
          <SiteHeading eyebrow="Room options" title="Pick the room that suits you" lead="The lowest monthly rent for each room type across our PGs." />
          <ul className="site-plans">{roomOptions.map((option) => (
            <li key={option.beds} className={`site-plan${option.beds === bestValue ? ' is-featured' : ''}`}>
              {option.beds === bestValue && <span className="site-plan-tag">Best value</span>}
              <p className="site-plan-name">{sharingLabel(option.beds)}</p>
              <p className="site-plan-price"><small>From</small> {formatRupees(option.withoutFood)}<small>/month</small></p>
              <ul>
                <li><BadgeCheck size={15} aria-hidden="true" /> {formatRupees(option.withFood)} with food</li>
                <li><BadgeCheck size={15} aria-hidden="true" /> {option.beds === 1 ? 'A room to yourself' : `Shared by ${option.beds}`}</li>
                <li><BadgeCheck size={15} aria-hidden="true" /> At {option.propertyCount} {option.propertyCount === 1 ? 'PG' : 'PGs'}</li>
              </ul>
              <SiteLink to={sitePaths.bookVisit} className={option.beds === bestValue ? 'primary-button site-cta' : 'secondary-button site-cta'}>Enquire</SiteLink>
            </li>
          ))}</ul>
        </section>
      )}

      <section className="site-section">
        <SiteHeading eyebrow="Why stay with us" title="Everything you need, in one place" />
        <ul className="site-perks">{perks.map(({ icon: Icon, title, text }) => <li key={title}><span className="site-icon"><Icon size={20} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></li>)}</ul>
        {amenities.length > 0 && <AmenityChips amenities={amenities} />}
      </section>

      {photos.length > 1 && isShown(content, 'gallery') && (
        <section className="site-section" id="gallery">
          <SiteHeading eyebrow="Gallery" title="Take a look inside" lead="Real photos of our rooms and spaces." />
          <ul className="site-photo-grid">{photos.slice(0, galleryPhotoCount).map((photo, index) => (
            <li key={photo.key} className={index === 0 ? 'is-wide' : undefined}>
              <SiteLink to={sitePaths.property(photo.propertyId)}><img src={photo.url} alt={photo.caption} loading="lazy" /><span>{photo.caption}</span></SiteLink>
            </li>
          ))}</ul>
        </section>
      )}

      {isShown(content, 'steps') && (
        <section className="site-section">
          <SiteHeading eyebrow="How it works" title="From enquiry to move-in" />
          <ol className="site-steps">{steps.map(({ icon: Icon, title, text }, index) => <li key={title}><span className="site-step-number">{index + 1}</span><Icon size={20} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></li>)}</ol>
        </section>
      )}

      <section className="site-cta-band">
        <h2>Ready to see your room?</h2>
        <p>Send a request and we will call you back, usually the same day.</p>
        <div className="site-actions">
          <SiteLink to={sitePaths.bookVisit} className="primary-button site-cta">Enquire now</SiteLink>
          {site.contactPhone && <a className="secondary-button site-cta" href={`tel:${site.contactPhone}`}><Phone size={16} aria-hidden="true" /> Call us</a>}
          {site.contactPhone && <a className="secondary-button site-cta" href={whatsappLink(site.contactPhone)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> WhatsApp</a>}
        </div>
      </section>
    </>
  )
}
