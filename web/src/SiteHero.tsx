import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

const slideMs = 5500

/**
 * The home page's full-screen hero: the property photos fading one into the next behind a dark overlay,
 * with the headline and buttons on top and a "scroll to explore" cue. The slides hold still for people
 * who prefer reduced motion, and the dots let anyone pick one.
 */
export function SiteHero({ photos, children }: { photos: string[]; children: ReactNode }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (photos.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % photos.length), slideMs)
    return () => window.clearInterval(timer)
  }, [photos.length, index])

  return (
    <section className="site-hero">
      {photos.map((photo, slide) => <img key={photo} className={`site-hero-slide${slide === index ? ' is-active' : ''}`} src={photo} alt="" loading={slide ? 'lazy' : 'eager'} />)}
      <div className="site-hero-copy">{children}</div>
      {photos.length > 1 && <div className="site-hero-dots" role="group" aria-label="Choose a photo">{photos.map((photo, slide) => <button key={photo} type="button" className={slide === index ? 'is-active' : undefined} aria-label={`Photo ${slide + 1} of ${photos.length}`} aria-pressed={slide === index} onClick={() => setIndex(slide)} />)}</div>}
      <a className="site-scroll-cue" href="#about"><span>Scroll to explore</span><ChevronDown size={18} aria-hidden="true" /></a>
    </section>
  )
}
