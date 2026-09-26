import { useRef, useState } from 'react'
import { Camera, LoaderCircle } from 'lucide-react'
import { Avatar } from './Avatar'
import { resizeToSquareJpeg } from './imageResize'
import { readApiError } from './superAdmin'

/**
 * The resident's own photo: click to choose a new one, or remove it. The image is resized in
 * the browser before upload; `onChanged` re-fetches the profile so the new version URL is used.
 */
export function ProfilePhotoPicker({ name, photoVersion, onChanged, onNotice }: { name: string; photoVersion: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
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

  return (
    <div className="profile-photo-picker">
      <button type="button" className={`profile-photo-button${isSaving ? ' is-saving' : ''}`} onClick={() => inputRef.current?.click()} disabled={isSaving} aria-label={photoUrl ? 'Change profile photo' : 'Add profile photo'} title={photoUrl ? 'Change photo' : 'Add a photo'}>
        <Avatar name={name} photoUrl={photoUrl} className="profile-photo" />
        <span className="profile-photo-overlay" aria-hidden="true">{isSaving ? <LoaderCircle size={22} className="spin" /> : <Camera size={20} />}<small>{isSaving ? 'Saving…' : photoUrl ? 'Change' : 'Add photo'}</small></span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
      {photoUrl && !isSaving && <button type="button" className="text-link profile-photo-remove" onClick={() => save(() => fetch('/api/resident-portal/photo', { method: 'DELETE' }), 'Profile photo removed.')}>Remove photo</button>}
    </div>
  )
}
