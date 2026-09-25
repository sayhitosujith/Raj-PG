import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { resizeToSquareJpeg } from './profilePhoto'

/** Pending photo change in the form: undefined = keep current, null = remove, string = new upload. */
export type PhotoChange = string | null | undefined

/**
 * Photo picker for the owner's add/edit resident form. Nothing is uploaded until the form is
 * saved; the chosen image is resized in the browser and previewed here in the meantime.
 */
export function ResidentPhotoField({ name, currentUrl, change, onChange, onError }: { name: string; currentUrl: string | null; change: PhotoChange; onChange: (change: PhotoChange) => void; onError: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isReading, setIsReading] = useState(false)
  const previewUrl = change === undefined ? currentUrl : change
  const hasPhoto = Boolean(previewUrl)

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsReading(true)
    const result = await resizeToSquareJpeg(file)
    setIsReading(false)
    if ('error' in result) { onError(result.error); return }
    onChange(result.dataUrl)
  }

  return (
    <div className="resident-photo-field">
      <Avatar name={name || '?'} photoUrl={previewUrl ?? null} className="resident-photo-preview" />
      <div className="resident-photo-copy">
        <strong>Profile photo <span>(optional)</span></strong>
        <small>{isReading ? 'Preparing photo…' : change === null ? 'Photo will be removed when you save.' : change ? 'New photo will be saved with the resident.' : 'Square photos work best; it will be cropped to a circle.'}</small>
        <div className="resident-photo-actions">
          <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={isReading}><Camera size={14} /> {hasPhoto ? 'Replace' : 'Choose photo'}</button>
          {hasPhoto && <button type="button" className="icon-button" aria-label="Remove photo" title="Remove photo" onClick={() => onChange(currentUrl ? null : undefined)}><Trash2 size={14} /></button>}
          {change === null && <button type="button" className="text-link" onClick={() => onChange(undefined)}>Undo</button>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}
