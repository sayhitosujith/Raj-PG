import { useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { resizeBannerImage } from './imageResize'
import { readApiError } from './superAdmin'

/**
 * The website banner on the admin Website page: a preview, "Choose image" (resized in the browser to
 * 2560px at high quality, then saved at once, like the logo) and "Remove", which brings back the theme-colour gradient.
 */
export function WebsiteBannerField({ bannerUrl, onChange, onNotice }: { bannerUrl: string | null; onChange: (url: string | null) => void; onNotice: (message: string) => void }) {
  const [isBusy, setIsBusy] = useState(false)

  async function send(init: RequestInit, done: string) {
    setIsBusy(true)
    try {
      const response = await fetch('/api/site-content/banner', init)
      if (!response.ok) { onNotice(await readApiError(response, 'The banner image could not be saved.')); return }
      onChange((await response.json() as { bannerUrl: string | null }).bannerUrl)
      onNotice(done)
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsBusy(false)
    }
  }

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const resized = await resizeBannerImage(file)
    if ('error' in resized) { onNotice(resized.error); return }
    await send({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: resized.dataUrl }) }, 'Banner updated. Visitors see it straight away.')
  }

  return (
    <div className="website-banner">
      <div className="website-banner-preview">{bannerUrl ? <img src={bannerUrl} alt="Current website banner" /> : <span>No image: the banner shows your theme colour</span>}</div>
      <div className="website-banner-actions">
        <label className={`secondary-button website-banner-choose${isBusy ? ' is-busy' : ''}`}>
          <ImagePlus size={15} aria-hidden="true" /> {isBusy ? 'Saving…' : bannerUrl ? 'Replace image' : 'Choose image'}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={isBusy} onChange={(event) => void choose(event)} />
        </label>
        {bannerUrl && <button type="button" className="secondary-button" disabled={isBusy} onClick={() => void send({ method: 'DELETE' }, 'Banner image removed.')}><Trash2 size={15} aria-hidden="true" /> Remove</button>}
        <small>Use a wide landscape photo at least 1600px wide (the original from your phone or camera). Your headline sits on top of it.</small>
      </div>
    </div>
  )
}
