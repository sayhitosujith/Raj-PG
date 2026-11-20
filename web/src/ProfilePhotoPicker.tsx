import { useRef } from 'react'
import { Camera, LoaderCircle } from 'lucide-react'
import { Avatar } from './Avatar'
import { resizeToSquareJpeg } from './imageResize'
import { useImageSave } from './useImageSave'

/** The resident's own photo URL for a photo version (it changes with each upload, so caches refresh); null without one. */
export const photoUrlFor = (photoVersion: number | null) => photoVersion ? `/api/resident-portal/photo?v=${photoVersion}` : null

/**
 * The resident's own photo on their Profile: click to choose a new one. The image is resized in the
 * browser before upload.
 */
export function ProfilePhotoPicker({ name, photoVersion, onChanged, onNotice }: { name: string; photoVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { isSaving, save } = useImageSave(onChanged, onNotice)
  const photoUrl = photoUrlFor(photoVersion)

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizeToSquareJpeg(file)
    if ('error' in result) { onNotice(result.error); return }
    await save(() => fetch('/api/resident-portal/photo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: result.dataUrl }) }), 'Profile photo updated.', 'Could not update your photo.')
  }

  const choosePhoto = () => inputRef.current?.click()
  return (
    <div className="profile-photo-picker">
      <button type="button" className={`profile-photo-button${isSaving ? ' is-saving' : ''}`} onClick={choosePhoto} disabled={isSaving} aria-label={photoUrl ? 'Change profile photo' : 'Add profile photo'}>
        <Avatar name={name} photoUrl={photoUrl} className="profile-photo" />
        <span className="profile-photo-overlay" aria-hidden="true">{isSaving ? <LoaderCircle size={22} className="spin" /> : <Camera size={20} />}<small>{isSaving ? 'Saving…' : photoUrl ? 'Change' : 'Add photo'}</small></span>
        {/* Always visible, unlike the hover overlay, so phones (no hover) can tell the photo is editable. */}
        <span className="profile-photo-badge" aria-hidden="true"><Camera size={14} /></span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}
