import { useEffect, useState } from 'react'
import { Clock, Download, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { PolicyDialog, type Policy } from './PolicyDialog'
import { sitePaths } from './router'
import { addressOf, whatsappLink, type SiteData } from './siteData'
import { SiteLink } from './SiteLink'

const quickLinks = [
  { label: 'Home', to: sitePaths.home },
  { label: 'Locations', to: sitePaths.locations },
  { label: 'Our PGs', to: sitePaths.properties },
  { label: 'Food & rules', to: sitePaths.foodAndRules },
  { label: 'Contact us', to: sitePaths.contact },
  { label: 'Book a visit', to: sitePaths.bookVisit },
]

/**
 * The website's footer: the brand with a short line, quick links and policies, contact details with
 * each PG's address, and the resident app card with a QR code to sign in on a phone. Then a bottom bar
 * with the copyright and policy links. Only details the owner has entered are shown.
 */
export function SiteFooter({ site }: { site: SiteData | null }) {
  const [openPolicy, setOpenPolicy] = useState<Policy | null>(null)
  const [appQr, setAppQr] = useState('')
  const signInUrl = `${window.location.origin}${sitePaths.login}`

  // The QR library is only needed here, so it loads with the footer rather than with the whole app.
  useEffect(() => {
    let isCurrent = true
    import('qrcode').then(({ toDataURL }) => toDataURL(signInUrl, { margin: 1, width: 220 })).then((url) => { if (isCurrent) setAppQr(url) }, () => undefined)
    return () => { isCurrent = false }
  }, [signInUrl])

  const policies = site ? [{ title: 'Terms and conditions', text: site.termsAndConditions }, { title: 'Privacy policy', text: site.privacyPolicy }].filter((policy) => policy.text) : []
  const cities = site ? [...new Set(site.properties.map((property) => property.city?.trim()).filter((city): city is string => Boolean(city)))] : []
  const policyLinks = policies.map((policy) => <button key={policy.title} type="button" className="site-footer-link" onClick={() => setOpenPolicy(policy)}>{policy.title}</button>)

  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <BrandMark />
          {site && <p>{site.businessName} offers comfortable, furnished PG rooms{cities.length ? ` in ${cities.join(', ')}` : ''}, with food, housekeeping and a resident app for rent, meals and requests.</p>}
          {site?.contactPhone && <a className="site-footer-social" href={whatsappLink(site.contactPhone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" title="WhatsApp"><MessageCircle size={17} aria-hidden="true" /></a>}
        </div>

        <div className="site-footer-links">
          <h3>Quick links</h3>
          <nav aria-label="Website footer">{quickLinks.map((item) => <SiteLink key={item.label} to={item.to}>{item.label}</SiteLink>)}</nav>
          {policyLinks.length > 0 && <><h3>Legal &amp; policies</h3><div className="site-footer-stack">{policyLinks}</div></>}
        </div>

        <div className="site-footer-contact">
          <h3>Contact info</h3>
          <ul>
            {site?.properties.map((property) => addressOf(property) && <li key={property.id}><MapPin size={16} aria-hidden="true" /><span><strong>{property.name}</strong>{addressOf(property)}</span></li>)}
            {site?.contactPhone && <li><Phone size={16} aria-hidden="true" /><span><a href={`tel:${site.contactPhone}`}>{site.contactPhone}</a><small><Clock size={11} aria-hidden="true" /> Call or WhatsApp, we usually reply the same day</small></span></li>}
            {site?.contactEmail && <li><Mail size={16} aria-hidden="true" /><span><a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></span></li>}
          </ul>
        </div>

        <div className="site-footer-app">
          <h3>Resident app</h3>
          <div className="site-app-card">
            {appQr ? <img src={appQr} alt="QR code to open the resident app" width={110} height={110} /> : <span className="site-app-qr-placeholder" aria-hidden="true" />}
            <div>
              <strong><Download size={15} aria-hidden="true" /> Use it on your phone</strong>
              <p>Scan to sign in for rent, meals, housekeeping and repairs.</p>
              <SiteLink to={sitePaths.login} className="primary-button site-cta">Sign in</SiteLink>
            </div>
          </div>
        </div>
      </div>

      <div className="site-footer-bottom">
        <p>© {new Date().getFullYear()} {site?.businessName ?? ''}. All rights reserved.</p>
        <div className="site-footer-inline">{policyLinks}<SiteLink to={sitePaths.contact}>Contact</SiteLink></div>
      </div>
      {openPolicy && site && <PolicyDialog businessName={site.businessName} policy={openPolicy} onClose={() => setOpenPolicy(null)} />}
    </footer>
  )
}
