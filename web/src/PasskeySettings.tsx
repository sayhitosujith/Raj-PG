import { useEffect, useState } from 'react'
import { Fingerprint, Trash2 } from 'lucide-react'
import { addPasskey, canUseDeviceUnlock, type Passkey } from './passkeys'
import { readApiError } from './superAdmin'
import { FeatureRibbon, FeatureTag, useFeatureBadge } from './FeatureBadges'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * "Face ID / fingerprint sign-in" in the resident's profile: turn it on for this phone, and see or
 * remove the phones where it is on. The turn-on button only appears on devices that can do it, so
 * a laptop without a fingerprint reader still lists (and can remove) keys saved on a phone.
 */
export function PasskeySettings({ onNotice }: { onNotice: (message: string) => void }) {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [canAdd, setCanAdd] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  // The owner's banner for this card; "New" goes once the resident tries turning it on.
  const { ribbon, tag, markSeen } = useFeatureBadge('passkeys')

  useEffect(() => {
    void canUseDeviceUnlock().then(setCanAdd)
    fetch('/api/resident-portal/passkeys').then((response) => response.ok ? response.json() as Promise<Passkey[]> : null).then((list) => { if (list) setPasskeys(list) }, () => undefined)
  }, [])

  async function turnOn() {
    setIsSaving(true)
    setError('')
    try {
      const list = await addPasskey()
      if (!list) return
      setPasskeys(list)
      onNotice('Face ID / fingerprint sign-in is on for this phone.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not set it up.')
    } finally {
      setIsSaving(false)
    }
  }

  async function remove(passkey: Passkey) {
    if (!window.confirm(`Turn off Face ID / fingerprint sign-in on ${passkey.label}? You can still sign in with your password.`)) return
    const response = await fetch(`/api/resident-portal/passkeys/${passkey.id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) { setError(response ? await readApiError(response, 'Could not turn it off.') : 'Could not reach the server.'); return }
    setPasskeys(await response.json() as Passkey[])
    onNotice(`Face ID / fingerprint sign-in turned off on ${passkey.label}.`)
  }

  // Nothing to show on a device that cannot use it and has none saved.
  if (!canAdd && !passkeys?.length) return null
  return (
    <section className={`passkey-settings${ribbon ? ' has-ribbon' : ''}`}>
      {ribbon && <FeatureRibbon badge={ribbon} />}
      <div className="passkey-settings-head">
        <span className="passkey-settings-icon"><Fingerprint size={18} /></span>
        <div><strong>Face ID / fingerprint sign-in{tag && <FeatureTag badge={tag} />}</strong><small>Sign in on this phone without typing your password. Your face or fingerprint stays on your phone.</small></div>
        {canAdd && <button type="button" className="secondary-button" disabled={isSaving} onClick={() => { markSeen(); void turnOn() }}>{isSaving ? 'Waiting for your phone…' : 'Turn on'}</button>}
      </div>
      {passkeys && passkeys.length > 0 && <ul className="passkey-list">
        {passkeys.map((passkey) => <li key={passkey.id}><span><strong>{passkey.label}</strong><small>Added {shortDate(passkey.createdAt)}{passkey.lastUsedAt ? ` · last used ${shortDate(passkey.lastUsedAt)}` : ''}</small></span><button type="button" className="icon-button" aria-label={`Turn off on ${passkey.label}`} title="Turn off" onClick={() => void remove(passkey)}><Trash2 size={14} /></button></li>)}
      </ul>}
      {error && <p className="login-error" role="alert">{error}</p>}
    </section>
  )
}
