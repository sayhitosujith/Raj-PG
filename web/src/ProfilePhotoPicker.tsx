import { useRef, useState } from 'react'
import { Camera, LoaderCircle } from 'lucide-react'
import { Avatar } from './Avatar'
import { resizeToSquareJpeg } from './imageResize'
import { useTabLayout } from './useTabLayout'
import { readApiError } from './superAdmin'

const photoUrlFor = (photoVersion: number | null) => photoVersion ? `/api/resident-portal/photo?v=${photoVersion}` : null

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
 * The resident's own photo: click to choose a new one. Without `onOpenProfile` the link under it
 * removes the photo. On the Home card (`onOpenProfile` set) the link is "View Profile" instead, and
 * in the phone and tablet layout the photo opens Profile too; on desktop removing the photo is the
 * RemovePhotoButton beside "Your profile". The image is resized in the browser before upload.
 */
export function ProfilePhotoPicker({ name, photoVersion, onChanged, onNotice, onOpenProfile }: { name: string; photoVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void; /** Set on the Home card: shows "View Profile", and on phones and tablets the photo opens Profile. */ onOpenProfile?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { isSaving, save, remove } = usePhotoSave(onChanged, onNotice)
  const isTabLayout = useTabLayout()
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
  const photoOpensProfile = Boolean(onOpenProfile) && isTabLayout
  return (
    <div className="profile-photo-picker">
      <button type="button" className={`profile-photo-button${isSaving ? ' is-saving' : ''}${photoOpensProfile ? ' opens-profile' : ''}`} onClick={photoOpensProfile ? onOpenProfile : choosePhoto} disabled={isSaving} aria-label={photoOpensProfile ? 'Open your profile' : photoUrl ? 'Change profile photo' : 'Add profile photo'}>
        <Avatar name={name} photoUrl={photoUrl} className="profile-photo" />
        {!photoOpensProfile && <span className="profile-photo-overlay" aria-hidden="true">{isSaving ? <LoaderCircle size={22} className="spin" /> : <Camera size={20} />}<small>{isSaving ? 'Saving…' : photoUrl ? 'Change' : 'Add photo'}</small></span>}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
      {onOpenProfile
        ? <button type="button" className="text-link profile-photo-remove" onClick={onOpenProfile}>View Profile</button>
        : photoUrl && !isSaving && <button type="button" className="text-link profile-photo-remove" onClick={() => void remove()}>Remove photo</button>}
    </div>
  )
}

/** "Remove photo" on its own, for desktop's "Your profile" heading; hidden while there is no photo. */
export function RemovePhotoButton({ photoVersion, onChanged, onNotice }: { photoVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const { isSaving, remove } = usePhotoSave(onChanged, onNotice)
  if (!photoUrlFor(photoVersion)) return null
  return <button type="button" className="text-link" disabled={isSaving} onClick={() => void remove()}>{isSaving ? 'Removing…' : 'Remove photo'}</button>
}
