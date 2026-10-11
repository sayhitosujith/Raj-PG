import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'
import { resizeGalleryPhoto } from './imageResize'
import { InlineLoader } from './Loader'
import { ModalLayer } from './ModalLayer'
import { readApiError } from './superAdmin'

/** A gallery photo as the API lists it: the image is fetched from `url`. */
export type PropertyPhoto = { id: string; caption: string | null; url: string }
type PhotoList = { photos: PropertyPhoto[]; max: number }

/**
 * The owner's photo gallery for one property: add photos (several at once, resized in the browser),
 * give each a caption, or remove it. Residents of the property see these on their Home tab. Every
 * change returns the updated list, so the modal always shows what is saved.
 */
export function PropertyPhotosManager({ propertyId, propertyName, onClose, onNotice }: { propertyId: string; propertyName: string; onClose: () => void; onNotice: (message: string) => void }) {
  const [list, setList] = useState<PhotoList | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const base = `/api/properties/${propertyId}/photos`

  useEffect(() => {
    fetch(base).then(async (response) => {
      if (response.ok) setList(await response.json() as PhotoList)
      else onNotice(await readApiError(response, 'The photos could not be loaded.'))
    }, () => onNotice('Could not reach the server.'))
  }, [base]) // eslint-disable-line react-hooks/exhaustive-deps -- load once per property

  async function send(url: string, init: RequestInit, failure: string) {
    const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
    if (!response.ok) { onNotice(await readApiError(response, failure)); return false }
    setList(await response.json() as PhotoList)
    return true
  }

  // Uploads one at a time, in order, stopping at the limit; the server enforces it too.
  async function addPhotos(files: FileList | null) {
    if (!files?.length || !list) return
    setIsBusy(true)
    let room = list.max - list.photos.length
    for (const file of Array.from(files)) {
      if (room <= 0) { onNotice(`A property can have up to ${list.max} photos.`); break }
      const resized = await resizeGalleryPhoto(file)
      if ('error' in resized) { onNotice(resized.error); continue }
      if (await send(base, { method: 'POST', body: JSON.stringify({ image: resized.dataUrl }) }, 'The photo could not be saved.')) room -= 1
    }
    setIsBusy(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  const saveCaption = (photo: PropertyPhoto, caption: string) => {
    if ((photo.caption ?? '') === caption.trim()) return
    void send(`${base}/${photo.id}`, { method: 'PATCH', body: JSON.stringify({ caption }) }, 'The caption could not be saved.')
  }
  const remove = (photo: PropertyPhoto) => {
    if (window.confirm('Remove this photo? Residents will no longer see it.')) void send(`${base}/${photo.id}`, { method: 'DELETE' }, 'The photo could not be removed.')
  }

  const isFull = list ? list.photos.length >= list.max : true
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="profile-modal property-photos-modal" role="dialog" aria-modal="true" aria-labelledby="property-photos-title">
        <div className="modal-heading"><div><p className="eyebrow">{propertyName}</p><h2 id="property-photos-title">Photos</h2></div><button type="button" className="icon-button" aria-label="Close photos" onClick={onClose}><X size={18} /></button></div>
        <p className="property-photos-hint">Residents of this property see these on their Home tab. Add a short caption so they know what each shows, e.g. "Room 102" or "Dining hall".</p>
        {list ? <>
          <ul className="property-photos-grid">
            {list.photos.map((photo) => (
              <li key={photo.id}>
                <img src={photo.url} alt={photo.caption ?? 'Property photo'} loading="lazy" />
                <input defaultValue={photo.caption ?? ''} maxLength={80} placeholder="Add a caption" aria-label="Caption" onBlur={(event) => saveCaption(photo, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
                <button type="button" className="row-delete" aria-label="Remove photo" title="Remove photo" onClick={() => remove(photo)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="property-photos-actions">
            <span>{list.photos.length} of {list.max} photos</span>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => void addPhotos(event.target.files)} />
            <button type="button" className="primary-button" disabled={isFull || isBusy} onClick={() => fileInput.current?.click()}><ImagePlus size={15} /> {isBusy ? 'Uploading…' : 'Add photos'}</button>
          </div>
        </> : <InlineLoader label="Loading photos…" />}
      </div>
    </div></ModalLayer>
  )
}
