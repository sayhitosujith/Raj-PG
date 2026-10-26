import { useRef, useState } from 'react'
import { Camera, LoaderCircle } from 'lucide-react'
import { Avatar } from './Avatar'
import { resizeToSquareJpeg } from './imageResize'
import { readApiError } from './superAdmin'

/** The resident's own photo URL for a photo version (it changes with each upload, so caches refresh); null without one. */
export const photoUrlFor = (photoVersion: number | null) => photoVersion ? `/api/resident-portal/photo?v=${photoVersion}` : null

/**
 * Saving a change to the resident's photo: runs the request, then re-fetches the profile so the new
 * version URL is used, and reports the outcome through the toast. Shared by the photo itself and the
 * separate "Remove photo" link on desktop.
 */
function usePhotoSave(onChanged: () => Promise<void>, onNotice: (message: string) => void) {
  const [isSaving, setIsSaving] = useState(false)
  async function save(request: () => Promise<Response>, success: string) {
    setIsSaving(true)
    try {
      const response = await request()
      if (!response.ok) { onNotice(await readApiError(response, 'Could not update your photo.')); return }
      await onChanged()
      onNotice(success)
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }
  const remove = () => save(() => fetch('/api/resident-portal/photo', { method: 'DELETE' }), 'Profile photo removed.')
  return { isSaving, save, remove }
}

/**
 * The resident's own photo on their Profile: click to choose a new one, and the link under it removes
 * it (on desktop that is the RemovePhotoButton beside "Your profile"). The image is resized in the
 * browser before upload.
 */
export function ProfilePhotoPicker({ name, photoVersion, onChanged, onNotice }: { name: string; photoVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { isSaving, save, remove } = usePhotoSave(onChanged, onNotice)
  const photoUrl = photoUrlFor(photoVersion)

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizeToSquareJpeg(file)
    if ('error' in result) { onNotice(result.error); return }
    await save(() => fetch('/api/resident-portal/photo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: result.dataUrl }) }), 'Profile photo updated.')
  }

  const choosePhoto = () => inputRef.current?.click()
  return (
    <div className="profile-photo-picker">
      <button type="button" className={`profile-photo-button${isSaving ? ' is-saving' : ''}`} onClick={choosePhoto} disabled={isSaving} aria-label={photoUrl ? 'Change profile photo' : 'Add profile photo'}>
        <Avatar name={name} photoUrl={photoUrl} className="profile-photo" />
        <span className="profile-photo-overlay" aria-hidden="true">{isSaving ? <LoaderCircle size={22} className="spin" /> : <Camera size={20} />}<small>{isSaving ? 'Saving…' : photoUrl ? 'Change' : 'Add photo'}</small></span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
      {photoUrl && !isSaving && <button type="button" className="text-link profile-photo-remove" onClick={() => void remove()}>Remove photo</button>}
    </div>
  )
}

/** "Remove photo" on its own, for desktop's "Your profile" heading; hidden while there is no photo. */
export function RemovePhotoButton({ photoVersion, onChanged, onNotice }: { photoVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const { isSaving, remove } = usePhotoSave(onChanged, onNotice)
  if (!photoUrlFor(photoVersion)) return null
  return <button type="button" className="text-link" disabled={isSaving} onClick={() => void remove()}>{isSaving ? 'Removing…' : 'Remove photo'}</button>
}
