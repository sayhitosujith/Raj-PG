import { useEffect, useState } from 'react'
import { LogIn, Menu, X } from 'lucide-react'
import { usePageTitle } from './pageTitle'
import { WhatsAppIcon } from './WhatsAppIcon'
import { BrandMark } from './BrandMark'
import { useBranding, useBrandingAutoRefresh } from './branding'
import { PageLoader } from './Loader'
import { sitePaths } from './router'
import { emptySiteContent, isShown, visibleLinks } from './siteContent'
import { fetchSite, whatsappLink, type SiteData } from './siteData'
import { SiteAppSheet } from './SiteAppSheet'
import { SiteContact } from './SiteContact'
import { SiteFoodRules } from './SiteFoodRules'
import { SiteFooter } from './SiteFooter'
import { SiteHome } from './SiteHome'
import { SiteLink } from './SiteLink'
import { SitePropertyPage } from './SitePropertyPage'
import { ThemeToggle } from './ThemeToggle'
import { useAdminBrand } from './useAdminBrand'
import './site.css'

const navItems = [
  { label: 'Home', to: sitePaths.home },
  { label: 'Locations', to: sitePaths.locations, section: 'locations' as const },
  { label: 'Our PGs', to: sitePaths.properties },
  { label: 'Food & rules', to: sitePaths.foodAndRules, section: 'foodAndRules' as const },
  { label: 'Contact', to: sitePaths.contact },
]

/**
 * The public website for people looking for a PG: home, a page per property, food and house rules, and
 * contact with the booking form. It reads live data (prices, free beds, photos, menus) and is drawn in
 * the colours chosen under Views. Residents and owners sign in from its header.
 */
export function PublicSite({ path }: { path: string }) {
  const [site, setSite] = useState<SiteData | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  useAdminBrand(useBranding().colours)
  useBrandingAutoRefresh()

  useEffect(() => { fetchSite().then(setSite, () => setHasFailed(true)) }, [])

  // The business name in the browser tab while the site is open; the app's own title comes back after.
  usePageTitle(site && `${site.businessName} · PG accommodation`)

  // A link to a section on another page ("/#locations" from a PG's page) lands before that page has its
  // data, so the section is scrolled to once the page has rendered.
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (site && hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' })
  }, [site, path])

  const closeMenu = () => setIsMenuOpen(false)
  // Sections the owner turned off leave the menu too (all show until the site has loaded).
  const content = site?.content ?? emptySiteContent
  const links = visibleLinks(navItems, content)
  const isHome = !path.startsWith('/pg/') && path !== sitePaths.foodAndRules && path !== sitePaths.contact
  const isCurrent = (to: string) => to === path || (to === sitePaths.properties && path.startsWith('/pg/')) || (to === sitePaths.home && path === sitePaths.website)
  const page = !site ? null
    : path.startsWith('/pg/') ? <SitePropertyPage site={site} propertyId={decodeURIComponent(path.slice('/pg/'.length))} />
    : path === sitePaths.foodAndRules && isShown(site.content, 'foodAndRules') ? <SiteFoodRules site={site} />
    : path === sitePaths.contact ? <SiteContact site={site} />
    : <SiteHome site={site} />

  return (
    <div className={`site${isHome ? ' is-home' : ''}`}>
      <header className="site-header">
        <SiteLink to={sitePaths.home} className="site-brand" onNavigate={closeMenu}><BrandMark /></SiteLink>
        <button type="button" className="site-menu-button" aria-expanded={isMenuOpen} aria-controls="site-nav" aria-label={isMenuOpen ? 'Close menu' : 'Open menu'} onClick={() => setIsMenuOpen((open) => !open)}>{isMenuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        <nav id="site-nav" className={`site-nav${isMenuOpen ? ' is-open' : ''}`} aria-label="Website">
          {links.map((item) => <SiteLink key={item.label} to={item.to} onNavigate={closeMenu} className="site-nav-link" aria-current={isCurrent(item.to) ? 'page' : undefined}>{item.label}</SiteLink>)}
          <div className="site-nav-actions">
            <ThemeToggle className="site-theme-toggle" />
            <SiteLink to={sitePaths.login} onNavigate={closeMenu} className="secondary-button site-signin"><LogIn size={15} aria-hidden="true" /> Sign in</SiteLink>
            <SiteLink to={sitePaths.bookVisit} onNavigate={closeMenu} className="primary-button site-cta">Book a visit</SiteLink>
          </div>
        </nav>
      </header>

      <main className="site-main">
        {hasFailed
          ? <section className="site-section site-not-found"><h1>The site is not available right now</h1><p>Please try again in a little while.</p></section>
          : page ?? <PageLoader />}
      </main>

      {site?.contactPhone && isShown(content, 'whatsapp') && <a className="site-whatsapp" href={whatsappLink(site.contactPhone)} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" title="Chat with us on WhatsApp"><WhatsAppIcon size={28} /></a>}

      <SiteFooter site={site} />
      {site && <SiteAppSheet businessName={site.businessName} />}
    </div>
  )
}
