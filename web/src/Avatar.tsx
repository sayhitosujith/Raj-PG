import { useState } from 'react'

function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

/** A person's photo, falling back to their initials when there is none or it fails to load. */
export function Avatar({ name, photoUrl, className }: { name: string; photoUrl: string | null; className: string }) {
  // Tracks which URL failed, so a newly uploaded photo (new URL) is tried again automatically.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPhoto = photoUrl !== null && photoUrl !== failedUrl
  return (
    <div className={`${className}${showPhoto ? ' has-photo' : ''}`}>
      {showPhoto ? <img src={photoUrl} alt="" onError={() => setFailedUrl(photoUrl)} /> : initials(name)}
    </div>
  )
}
