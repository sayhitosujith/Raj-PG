import { useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { copyWithNotice } from './clipboard'
import { readApiError } from './superAdmin'

/**
 * Issues a new access key for a resident and shows it once, with Copy. Keys are stored only as a
 * hash (the key is the resident's login until they set a password), so an existing key can never
 * be shown again; a new one replaces it. Doubles as the forgotten-password route: the server
 * clears any password and signs the resident out, which the confirmation spells out.
 */
export function AccessKeyReset({ residentId, residentName, hasPassword, onReset, onNotice }: { residentId: string; residentName: string; hasPassword: boolean; onReset: () => void; onNotice: (message: string) => void }) {
  const [accessKey, setAccessKey] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  async function issue() {
    const warning = hasPassword
      ? `Issue a new access key for ${residentName}? Their current password stops working and they are signed out; they will sign in with the new key and set a new password.`
      : `Issue a new access key for ${residentName}? Any key you shared earlier stops working.`
    if (!window.confirm(warning)) return
    setIsBusy(true)
    try {
      const response = await fetch(`/api/residents/${residentId}/access-key`, { method: 'POST' })
      if (!response.ok) { onNotice(await readApiError(response, 'Could not issue a new access key.')); return }
      setAccessKey((await response.json() as { accessKey: string }).accessKey)
      onReset()
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsBusy(false)
    }
  }

  if (accessKey) {
    return (
      <span className="access-key-reveal">
        <code>{accessKey}</code>
        <button type="button" className="icon-button" aria-label="Copy access key" title="Copy access key" onClick={() => copyWithNotice(accessKey, 'Access key', onNotice)}><Copy size={14} /></button>
        <small>Shown once. Copy it now and send it to the resident.</small>
      </span>
    )
  }
  return <button type="button" className="text-link access-key-issue" disabled={isBusy} onClick={issue}><KeyRound size={12} /> {isBusy ? 'Issuing…' : 'New access key'}</button>
}
