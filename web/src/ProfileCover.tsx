import { useRef } from 'react'
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { resizePropertyPhoto } from './imageResize'
import { useImageSave } from './useImageSave'

/**
 * The cover banner across the top of the resident's Profile, as on LinkedIn. It is the resident's own image when
 * they have chosen one, else the property's photo. The property photo is drawn twice (blurred to fill, whole on
 * top) so a logo-style picture is not cropped to a strip; the resident's own image simply fills the banner.
 */
export function ProfileCover({ propertyImage, coverVersion, onChanged, onNotice }: { propertyImage: string; coverVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { isSaving, save } = useImageSave(onChanged, onNotice)
  const ownCover = coverVersion ? `/api/resident-portal/cover?v=${coverVersion}` : null

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizePropertyPhoto(file)
    if ('error' in result) { onNotice(result.error); return }
    await save(() => fetch('/api/resident-portal/cover', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: result.dataUrl }) }), 'Cover image updated.', 'Could not update your cover image.')
  }

  const removeCover = () => save(() => fetch('/api/resident-portal/cover', { method: 'DELETE' }), 'Cover image removed.', 'Could not remove your cover image.')

  return (
    <div className="portal-profile-cover">
      {ownCover ? <img className="is-own" src={ownCover} alt="" /> : <><img className="is-fill" src={propertyImage} alt="" /><img src={propertyImage} alt="" /></>}
      <div className="portal-profile-cover-actions">
        {ownCover && !isSaving && <button type="button" className="icon-button" aria-label="Remove cover image" title="Remove cover image" onClick={() => void removeCover()}><Trash2 size={15} /></button>}
        <button type="button" className="icon-button" aria-label="Change cover image" title="Change cover image" disabled={isSaving} onClick={() => inputRef.current?.click()}>{isSaving ? <LoaderCircle size={15} className="spin" /> : <ImagePlus size={15} />}</button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}
