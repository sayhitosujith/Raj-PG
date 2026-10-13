import { Building2, Mail, Phone } from 'lucide-react'
import { WhatsAppIcon } from './WhatsAppIcon'
import { BookingForm } from './BookingForm'
import { whatsappLink, type SiteData } from './siteData'
import { PropertyAddress, SiteHeading } from './SiteParts'

/** Contact and "book a visit": call, WhatsApp, email and where each PG is, beside the booking form. */
export function SiteContact({ site }: { site: SiteData }) {
  const { contactPhone, contactEmail } = site
  return (
    <section className="site-section site-contact">
      <div>
        <SiteHeading eyebrow="Contact" title="Talk to us" lead="Questions about rooms, prices or food? We are happy to help." />
        <ul className="site-contact-list">
          {contactPhone && <li><a href={`tel:${contactPhone}`}><Phone size={18} aria-hidden="true" /><span>Call us</span><strong>{contactPhone}</strong></a></li>}
          {contactPhone && <li><a href={whatsappLink(contactPhone)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /><span>WhatsApp</span><strong>Chat with us</strong></a></li>}
          {contactEmail && <li><a href={`mailto:${contactEmail}`}><Mail size={18} aria-hidden="true" /><span>Email</span><strong>{contactEmail}</strong></a></li>}
        </ul>
        {site.properties.length > 0 && <>
          <h3 className="site-subheading">Where to find us</h3>
          <ul className="site-addresses">{site.properties.map((property) => <li key={property.id}><Building2 size={16} aria-hidden="true" /><div><strong>{property.name}</strong><PropertyAddress property={property} /></div></li>)}</ul>
        </>}
      </div>
      <div className="site-booking" id="book">
        <BookingForm options={{ businessName: site.businessName, contactPhone, properties: site.properties }} source="website" Heading="h2" />
      </div>
    </section>
  )
}
