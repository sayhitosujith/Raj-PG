import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ModalLayer } from './ModalLayer'
import { FeatureRibbon, useFeatureBadge } from './FeatureBadges'
import type { PropertyPhoto } from './PropertyPhotosManager'
import { useRefreshSignal } from './useAutoRefresh'

/**
 * The property's photo gallery on the resident's Home tab: a row of thumbnails that scrolls
 * sideways, and a full-screen viewer with captions, arrows and Escape. Shows nothing until the owner
 * adds photos (or if they cannot be loaded), so an empty gallery leaves no gap.
 */
export function PropertyGallery({ refreshSignal }: { refreshSignal: number }) {
  const [photos, setPhotos] = useState<PropertyPhoto[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const { badge, markSeen } = useFeatureBadge('photos')
  const load = () => fetch('/api/resident-portal/photos').then((response) => response.ok ? response.json() as Promise<{ photos: PropertyPhoto[] }> : null).then((body) => { if (body) setPhotos(body.photos) }, () => undefined)
  useEffect(() => { void load() }, [])
  useRefreshSignal(refreshSignal, () => { void load() })

  const step = (by: number) => setOpen((index) => index === null ? null : (index + by + photos.length) % photos.length)
  useEffect(() => {
    if (open === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, photos.length]) // eslint-disable-line react-hooks/exhaustive-deps -- step only reads state setters and the count

  if (!photos.length) return null
  const shown = open === null ? null : photos[open]
  return (
    <section className={`workspace-view portal-panel property-gallery${badge ? ' has-ribbon' : ''}`} data-panel="home" onClickCapture={markSeen}>{badge && <FeatureRibbon badge={badge} />}
      <div className="workspace-view-heading"><div><p className="eyebrow">Gallery</p><h2>Photos</h2><p>Your PG, from your property owner. Tap a photo to see it full size.</p></div></div>
      <ul className="property-gallery-strip">
        {photos.map((photo, index) => (
          <li key={photo.id}><button type="button" onClick={() => setOpen(index)} aria-label={`Open photo${photo.caption ? `: ${photo.caption}` : ` ${index + 1}`}`}>
            <img src={photo.url} alt="" loading="lazy" />
            {photo.caption && <span>{photo.caption}</span>}
          </button></li>
        ))}
      </ul>
      {shown && <ModalLayer><div className="gallery-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" onMouseDown={(event) => event.target === event.currentTarget && setOpen(null)}>
        <button type="button" className="gallery-close" aria-label="Close" onClick={() => setOpen(null)}><X size={20} /></button>
        {photos.length > 1 && <button type="button" className="gallery-arrow is-prev" aria-label="Previous photo" onClick={() => step(-1)}><ChevronLeft size={22} /></button>}
        <figure><img src={shown.url} alt={shown.caption ?? 'Property photo'} /><figcaption>{shown.caption ?? ''}<small>{(open ?? 0) + 1} / {photos.length}</small></figcaption></figure>
        {photos.length > 1 && <button type="button" className="gallery-arrow is-next" aria-label="Next photo" onClick={() => step(1)}><ChevronRight size={22} /></button>}
      </div></ModalLayer>}
    </section>
  )
}
