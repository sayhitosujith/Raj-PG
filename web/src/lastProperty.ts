/** The property of the last resident who signed in on this device, for the sign-in page's picture. */
export type LastProperty = { name: string; image: string; source: string }

// Per-device convenience in localStorage: a lost or blocked value just means the logo shows instead.
const storageKey = 'staynest-last-property'

/** The remembered property, or null on a first visit, another device, or when storage is unavailable. */
export function readLastProperty(): LastProperty | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as LastProperty | null
    return value?.image && value.name ? value : null
  } catch {
    return null
  }
}

/**
 * Remembers the signed-in resident's property photo for the sign-in page. A photo the owner uploaded
 * is served only to signed-in residents, so it is copied in as a data URL rather than kept as a link
 * that would fail once they sign out; a public photo URL is kept as it is. `source` (the versioned
 * URL) skips the copy when nothing changed, as the portal calls this on every refresh.
 */
export async function rememberProperty(name: string, source: string) {
  if (readLastProperty()?.source === source) return
  try {
    const image = source.startsWith('/') ? await toDataUrl(source) : source
    window.localStorage.setItem(storageKey, JSON.stringify({ name, image, source } satisfies LastProperty))
  } catch {
    // Too large for storage, or the photo could not be read: the sign-in page keeps the logo.
  }
}

async function toDataUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Property photo request failed')
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
