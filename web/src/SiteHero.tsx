import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { SiteHeroScene } from './SiteHeroScene'

/**
 * The home page's full-screen hero: the banner image chosen on the admin Website page, or without one a
 * theme-colour sky over an illustrated skyline (SiteHeroScene); the headline and buttons straight on it in the middle
 * (no card), and a "scroll to explore" cue.
 */
export function SiteHero({ image, children }: { image: string | null; children: ReactNode }) {
  return (
    <section className={`site-hero${image ? ' has-image' : ''}`}>
      {image
        ? <img className="site-hero-image" src={image} alt="" />
        : <SiteHeroScene />}
      <div className="site-hero-panel"><div className="site-hero-copy">{children}</div></div>
      <a className="site-scroll-cue" href="#about"><span>Scroll to explore</span><ChevronDown size={18} aria-hidden="true" /></a>
    </section>
  )
}
