import { useEffect, useState } from 'react'
import { LogIn, Menu, X } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { useBranding, useBrandingAutoRefresh } from './branding'
import { PageLoader } from './Loader'
import { sitePaths } from './router'
import { fetchSite, type SiteData } from './siteData'
import { SiteContact } from './SiteContact'
import { SiteFoodRules } from './SiteFoodRules'
import { SiteHome } from './SiteHome'
import { SiteLink } from './SiteLink'
import { SitePropertyPage } from './SitePropertyPage'
import { ThemeToggle } from './ThemeToggle'
import { useAdminBrand } from './useAdminBrand'
import './site.css'

const navItems = [
  { label: 'Home', to: sitePaths.home },
  { label: 'Our PGs', to: sitePaths.properties },
  { label: 'Food & rules', to: sitePaths.foodAndRules },
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
  useEffect(() => {
    if (!site) return
    const previous = document.title
    document.title = `${site.businessName} · PG accommodation`
    return () => { document.title = previous }
  }, [site])

  const closeMenu = () => setIsMenuOpen(false)
  const isCurrent = (to: string) => to === path || (to === sitePaths.properties && path.startsWith('/pg/'))
  const page = !site ? null
    : path.startsWith('/pg/') ? <SitePropertyPage site={site} propertyId={decodeURIComponent(path.slice('/pg/'.length))} />
    : path === sitePaths.foodAndRules ? <SiteFoodRules site={site} />
    : path === sitePaths.contact ? <SiteContact site={site} />
    : <SiteHome site={site} />

  return (
    <div className="site">
      <header className="site-header">
        <SiteLink to={sitePaths.home} className="site-brand" onNavigate={closeMenu}><BrandMark /></SiteLink>
        <button type="button" className="site-menu-button" aria-expanded={isMenuOpen} aria-controls="site-nav" aria-label={isMenuOpen ? 'Close menu' : 'Open menu'} onClick={() => setIsMenuOpen((open) => !open)}>{isMenuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        <nav id="site-nav" className={`site-nav${isMenuOpen ? ' is-open' : ''}`} aria-label="Website">
          {navItems.map((item) => <SiteLink key={item.label} to={item.to} onNavigate={closeMenu} className="site-nav-link" aria-current={isCurrent(item.to) ? 'page' : undefined}>{item.label}</SiteLink>)}
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

      <footer className="site-footer">
        <div className="site-footer-brand"><BrandMark />{site && <p>Comfortable PG living by {site.businessName}.</p>}</div>
        <nav aria-label="Website footer">{navItems.map((item) => <SiteLink key={item.label} to={item.to}>{item.label}</SiteLink>)}</nav>
        <div className="site-footer-contact">
          {site?.contactPhone && <a href={`tel:${site.contactPhone}`}>{site.contactPhone}</a>}
          {site?.contactEmail && <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>}
          <SiteLink to={sitePaths.login}>Resident or owner? Sign in</SiteLink>
        </div>
        <p className="site-copyright">© {new Date().getFullYear()} {site?.businessName ?? ''}</p>
      </footer>
    </div>
  )
}
