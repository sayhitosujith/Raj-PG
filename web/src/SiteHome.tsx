import { CalendarCheck, Home, KeyRound, MessageCircle, ShieldCheck, Sparkles, UtensilsCrossed, Wrench } from 'lucide-react'
import { amenityOptions } from './propertyFeatureOptions'
import { formatRupees } from './rent'
import { sitePaths } from './router'
import { startingPrice, type SiteData } from './siteData'
import { SiteLink } from './SiteLink'
import { AmenityChips, PropertyCard, SiteHeading } from './SiteParts'

// What every resident gets through the app, whichever property they choose.
const perks = [
  { icon: UtensilsCrossed, title: 'Food plan', text: 'See the weekly menu ahead, and skip a meal in one tap.' },
  { icon: Sparkles, title: 'Housekeeping on request', text: 'Book a room cleaning at a time that suits you.' },
  { icon: Wrench, title: 'Repairs tracked', text: 'Report a problem from your phone and follow it until it is fixed.' },
  { icon: ShieldCheck, title: 'Verified residents', text: "Every resident's ID is checked by the property owner." },
]

const steps = [
  { icon: MessageCircle, title: 'Tell us what you need', text: 'Send a request with your move-in date and budget.' },
  { icon: CalendarCheck, title: 'Visit the PG', text: 'We call you back, usually the same day, and show you around.' },
  { icon: KeyRound, title: 'Move in', text: 'Sign in to the resident app for rent, meals and requests.' },
]

/** The website's home page: hero, what residents get, the properties, how joining works. */
export function SiteHome({ site }: { site: SiteData }) {
  const { properties } = site
  const cities = [...new Set(properties.map((property) => property.city).filter((city): city is string => Boolean(city)))]
  const prices = properties.map(startingPrice).filter((price): price is number => price !== null)
  const freeBeds = properties.reduce((sum, property) => sum + property.freeBeds, 0)
  const amenities = amenityOptions.map((option) => option.value).filter((value) => properties.some((property) => property.amenities.includes(value)))
  const heroImage = properties.find((property) => property.image)?.image

  return (
    <>
      <section className="site-hero">
        {heroImage && <img className="site-hero-photo" src={heroImage} alt="" />}
        <div className="site-hero-copy">
          <p className="site-eyebrow">{site.businessName}</p>
          <h1>Comfortable PG living{cities.length ? ` in ${cities.join(', ')}` : ''}</h1>
          <p className="site-lead">Furnished rooms, home-style food and an app for everything from rent to repairs.{prices.length ? ` Rooms from ${formatRupees(Math.min(...prices))} a month.` : ''}</p>
          <div className="site-actions">
            <SiteLink to={sitePaths.bookVisit} className="primary-button site-cta">Book a visit</SiteLink>
            <SiteLink to={sitePaths.properties} className="secondary-button site-cta">See our PGs</SiteLink>
          </div>
          <ul className="site-stats">
            <li><strong>{properties.length}</strong> {properties.length === 1 ? 'property' : 'properties'}</li>
            {freeBeds > 0 && <li><strong>{freeBeds}</strong> {freeBeds === 1 ? 'bed' : 'beds'} free now</li>}
            {amenities.length > 0 && <li><strong>{amenities.length}</strong> amenities</li>}
          </ul>
        </div>
      </section>

      <section className="site-section">
        <SiteHeading eyebrow="Why stay with us" title="Everything you need, in one place" />
        <ul className="site-perks">{perks.map(({ icon: Icon, title, text }) => <li key={title}><span className="site-icon"><Icon size={20} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></li>)}</ul>
        {amenities.length > 0 && <AmenityChips amenities={amenities} />}
      </section>

      <section className="site-section" id="properties">
        <SiteHeading eyebrow="Our PGs" title="Choose your place" lead="Live availability and prices, straight from our records." />
        {properties.length
          ? <div className="site-property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div>
          : <p className="site-muted"><Home size={16} aria-hidden="true" /> Our properties will be listed here soon.</p>}
      </section>

      <section className="site-section">
        <SiteHeading eyebrow="How it works" title="From enquiry to move-in" />
        <ol className="site-steps">{steps.map(({ icon: Icon, title, text }, index) => <li key={title}><span className="site-step-number">{index + 1}</span><Icon size={20} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </section>

      <section className="site-cta-band">
        <h2>Ready to see your room?</h2>
        <p>Send a request and we will call you back, usually the same day.</p>
        <SiteLink to={sitePaths.bookVisit} className="primary-button site-cta">Book a visit</SiteLink>
      </section>
    </>
  )
}
