import { useRef, useState } from 'react'
import { Camera, LoaderCircle } from 'lucide-react'
import { Avatar } from './Avatar'
import { resizeToSquareJpeg } from './imageResize'
import { useTabLayout } from './useTabLayout'
import { readApiError } from './superAdmin'

/**
 * The resident's own photo: click to choose a new one, or remove it (on the Home card in the phone
 * and tablet layout the photo and its "View Profile" link open the Profile tab instead). The image
 * is resized in the browser before upload; `onChanged` re-fetches the profile so the new version URL
 * is used.
 */
export function ProfilePhotoPicker({ name, photoVersion, onChanged, onNotice, onOpenProfile }: { name: string; photoVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void; /** Set on the Home card: on phones and tablets a tap on the photo opens the Profile tab. */ onOpenProfile?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isTabLayout = useTabLayout()
  const photoUrl = photoVersion ? `/api/resident-portal/photo?v=${photoVersion}` : null

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

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizeToSquareJpeg(file)
    if ('error' in result) { onNotice(result.error); return }
    await save(() => fetch('/api/resident-portal/photo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: result.dataUrl }) }), 'Profile photo updated.')
  }

  const choosePhoto = () => inputRef.current?.click()
  // On Home in the tab layout the photo and the link under it both open Profile, where the photo
  // can be changed; everywhere else the photo itself changes it and the link removes it.
  const opensProfile = Boolean(onOpenProfile) && isTabLayout
  return (
    <div className="profile-photo-picker">
      <button type="button" className={`profile-photo-button${isSaving ? ' is-saving' : ''}${opensProfile ? ' opens-profile' : ''}`} onClick={opensProfile ? onOpenProfile : choosePhoto} disabled={isSaving} aria-label={opensProfile ? 'Open your profile' : photoUrl ? 'Change profile photo' : 'Add profile photo'}>
        <Avatar name={name} photoUrl={photoUrl} className="profile-photo" />
        {!opensProfile && <span className="profile-photo-overlay" aria-hidden="true">{isSaving ? <LoaderCircle size={22} className="spin" /> : <Camera size={20} />}<small>{isSaving ? 'Saving…' : photoUrl ? 'Change' : 'Add photo'}</small></span>}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
      {opensProfile
        ? <button type="button" className="text-link profile-photo-remove" onClick={onOpenProfile}>View Profile</button>
        : photoUrl && !isSaving && <button type="button" className="text-link profile-photo-remove" onClick={() => save(() => fetch('/api/resident-portal/photo', { method: 'DELETE' }), 'Profile photo removed.')}>Remove photo</button>}
    </div>
  )
}
