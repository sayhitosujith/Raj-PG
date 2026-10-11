import { useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * A row of cards that scrolls sideways: swipe on phones, arrow buttons on bigger screens. Native
 * scroll-snap keeps it light and accessible (keyboard and screen readers just see a list).
 */
export function SiteCarousel({ label, items }: { label: string; items: Array<{ key: string; content: ReactNode }> }) {
  const trackRef = useRef<HTMLUListElement>(null)
  // One card's width per press, so the next card lands where the previous one was.
  function scrollBy(direction: 1 | -1) {
    const track = trackRef.current
    const card = track?.firstElementChild as HTMLElement | null
    if (track && card) track.scrollBy({ left: direction * (card.offsetWidth + 18), behavior: 'smooth' })
  }
  return (
    <div className="site-carousel">
      <ul ref={trackRef} className="site-carousel-track" aria-label={label}>{items.map((item) => <li key={item.key}>{item.content}</li>)}</ul>
      {items.length > 1 && <div className="site-carousel-arrows">
        <button type="button" aria-label="Previous" onClick={() => scrollBy(-1)}><ChevronLeft size={20} /></button>
        <button type="button" aria-label="Next" onClick={() => scrollBy(1)}><ChevronRight size={20} /></button>
      </div>}
    </div>
  )
}
