import { useState } from 'react'
import { readApiError } from './superAdmin'

/**
 * Saving a change to one of the resident's own images (photo or Profile cover): runs the request, then re-fetches
 * the profile so the new version URL is used, and reports the outcome through the toast.
 */
export function useImageSave(onChanged: () => Promise<void>, onNotice: (message: string) => void) {
  const [isSaving, setIsSaving] = useState(false)
  async function save(request: () => Promise<Response>, success: string, failure: string) {
    setIsSaving(true)
    try {
      const response = await request()
      if (!response.ok) { onNotice(await readApiError(response, failure)); return }
      await onChanged()
      onNotice(success)
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }
  return { isSaving, save }
}
