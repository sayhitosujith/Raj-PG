import { useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { CameraCapture } from './CameraCapture'

/** Pending photo change in the form: undefined = keep current, null = remove, string = new upload. */
export type PhotoChange = string | null | undefined

/**
 * Photo field for the owner's add/edit forms (residents and property staff). The photo can only be taken live with
 * the device camera, never picked from saved files, so it shows the actual person. Nothing is uploaded until the
 * form is saved; the picture is previewed here in the meantime.
 */
export function ResidentPhotoField({ name, currentUrl, change, onChange, subject = 'resident', isRequired = false }: { name: string; currentUrl: string | null; change: PhotoChange; onChange: (change: PhotoChange) => void; /** The resident's own registration needs one; staff forms may leave it out. */ isRequired?: boolean; /** Who the photo belongs to, for the hint text; the staff form reuses this picker. */ subject?: string }) {
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const previewUrl = change === undefined ? currentUrl : change
  const hasPhoto = Boolean(previewUrl)

  return (
    <div className="resident-photo-field">
      <Avatar name={name || '?'} photoUrl={previewUrl ?? null} className="resident-photo-preview" />
      <div className="resident-photo-copy">
        <strong>Profile photo <span>{isRequired ? '(required)' : '(optional)'}</span></strong>
        <small>{change === null ? 'Photo will be removed when you save.' : change ? `New photo will be saved with the ${subject}.` : 'Taken live with the camera; it will be cropped to a circle.'}</small>
        <div className="resident-photo-actions">
          <button type="button" className="secondary-button" onClick={() => setIsCameraOpen(true)}><Camera size={14} /> {hasPhoto ? 'Retake' : 'Take photo'}</button>
          {hasPhoto && <button type="button" className="icon-button" aria-label="Remove photo" title="Remove photo" onClick={() => onChange(currentUrl ? null : undefined)}><Trash2 size={14} /></button>}
          {change === null && <button type="button" className="text-link" onClick={() => onChange(undefined)}>Undo</button>}
        </div>
      </div>
      {isCameraOpen && <CameraCapture onCapture={(dataUrl) => { onChange(dataUrl); setIsCameraOpen(false) }} onClose={() => setIsCameraOpen(false)} />}
    </div>
  )
}
