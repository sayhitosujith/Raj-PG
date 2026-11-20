import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LoaderCircle, Move, Trash2, ZoomIn } from 'lucide-react'
import { centredCover, coverImageStyle, maxCoverZoom, type CoverPosition } from './coverPosition'
import { resizePropertyPhoto } from './imageResize'
import { useCoverDrag } from './useCoverDrag'
import { useImageSave } from './useImageSave'

/**
 * The cover banner across the top of the resident's Profile, as on LinkedIn. It is the resident's own image when
 * they have chosen one, else the property's photo. The property photo is drawn twice (blurred to fill, whole on
 * top) so a logo-style picture is not cropped to a strip; the resident's own image simply fills the banner, at the
 * focal point and zoom they chose in adjust mode (which opens by itself after an upload).
 */
export function ProfileCover({ propertyImage, coverVersion, coverPosition, onChanged, onNotice }: { propertyImage: string; coverVersion: number | null; coverPosition: CoverPosition | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const adjustOnLoad = useRef(false)
  const [draft, setDraft] = useState<CoverPosition | null>(null)
  const { isSaving, save } = useImageSave(onChanged, onNotice)
  const shown = draft ?? coverPosition ?? centredCover
  const { imageRef, handlers } = useCoverDrag(shown, setDraft)
  const ownCover = coverVersion ? `/api/resident-portal/cover?v=${coverVersion}` : null
  const isAdjusting = Boolean(ownCover && draft)

  // The Adjust button disappears in adjust mode, so focus moves to the banner, where the arrow keys work.
  useEffect(() => { if (isAdjusting) bannerRef.current?.focus() }, [isAdjusting])

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizePropertyPhoto(file)
    if ('error' in result) { onNotice(result.error); return }
    // Set before saving: the refreshed profile can swap in the new image, and it can load, before save resolves.
    adjustOnLoad.current = true
    const saved = await save(() => fetch('/api/resident-portal/cover', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: result.dataUrl }) }), 'Cover image updated.', 'Could not update your cover image.')
    if (!saved) adjustOnLoad.current = false
  }

  function onOwnCoverLoad() {
    if (!adjustOnLoad.current) return
    adjustOnLoad.current = false
    setDraft(coverPosition ?? centredCover)
  }

  async function savePosition() {
    if (!draft) return
    const saved = await save(() => fetch('/api/resident-portal/cover/position', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }), 'Cover position saved.', 'Could not save your cover position.')
    if (saved) setDraft(null)
  }

  const removeCover = () => save(() => fetch('/api/resident-portal/cover', { method: 'DELETE' }), 'Cover image removed.', 'Could not remove your cover image.')

  return (
    <div ref={bannerRef} className={`portal-profile-cover${isAdjusting ? ' is-adjusting' : ''}`} {...(isAdjusting ? { ...handlers, tabIndex: 0, role: 'group', 'aria-label': 'Cover image position: drag the picture, or use the arrow keys, to move it' } : {})}>
      {ownCover ? <img ref={imageRef} className="is-own" src={ownCover} alt="" draggable={false} style={coverImageStyle(shown)} onLoad={onOwnCoverLoad} /> : <><img className="is-fill" src={propertyImage} alt="" /><img src={propertyImage} alt="" /></>}
      {isAdjusting ? <>
        <span className="portal-profile-cover-hint" aria-hidden="true">Drag to reposition</span>
        <CoverAdjustBar zoom={shown.zoom} isSaving={isSaving} onZoom={(zoom) => setDraft({ ...shown, zoom })} onSave={() => void savePosition()} onCancel={() => setDraft(null)} />
      </> : <div className="portal-profile-cover-actions">
        {ownCover && !isSaving && <button type="button" className="icon-button" aria-label="Adjust cover image" title="Adjust cover image" onClick={() => setDraft(shown)}><Move size={15} /></button>}
        {ownCover && !isSaving && <button type="button" className="icon-button" aria-label="Remove cover image" title="Remove cover image" onClick={() => void removeCover()}><Trash2 size={15} /></button>}
        <button type="button" className="icon-button" aria-label="Change cover image" title="Change cover image" disabled={isSaving} onClick={() => inputRef.current?.click()}>{isSaving ? <LoaderCircle size={15} className="spin" /> : <ImagePlus size={15} />}</button>
      </div>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}

function CoverAdjustBar({ zoom, isSaving, onZoom, onSave, onCancel }: { zoom: number; isSaving: boolean; onZoom: (zoom: number) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="portal-profile-cover-adjust">
      <label className="portal-profile-cover-zoom"><ZoomIn size={15} aria-hidden="true" /><input type="range" min={1} max={maxCoverZoom} step={0.01} value={zoom} aria-label="Zoom" disabled={isSaving} onChange={(event) => onZoom(Number(event.target.value))} /></label>
      <button type="button" onClick={onCancel} disabled={isSaving}>Cancel</button>
      <button type="button" className="is-primary" onClick={onSave} disabled={isSaving}>{isSaving ? <LoaderCircle size={15} className="spin" aria-label="Saving" /> : 'Save'}</button>
    </div>
  )
}
