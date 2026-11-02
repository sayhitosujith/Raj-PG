import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react'
import { CopyButton } from './CopyButton'
import { readApiError } from './superAdmin'
import { useIsSuperAdmin } from './staffContext'

/**
 * The owner's side of a door lock PIN, for a resident or a member of the property staff. The app only records
 * the PIN: the locks are programmed by hand, which is why every change asks for confirmation and says so.
 * Receptionists see the PIN (they hand it over at the desk) but only super admins can issue or remove one.
 */
export function DoorKeyManager({ keyUrl, holderName, doorAccessKey, revokedAt, onChanged, onNotice }: { /** The holder's door-key endpoint: POST issues a PIN, DELETE removes it. */ keyUrl: string; holderName: string; doorAccessKey: string | null | undefined; /** Set when it was removed automatically for overdue rent. */ revokedAt?: string | null; /** Called with the new PIN, or null once removed. */ onChanged: (doorAccessKey: string | null) => void; onNotice: (message: string) => void }) {
  const canManage = useIsSuperAdmin()
  const [isBusy, setIsBusy] = useState(false)

  async function change(method: 'POST' | 'DELETE') {
    const question = method === 'DELETE'
      ? `Remove ${holderName}'s door access key? Also delete it from the locks so it stops opening the doors.`
      : doorAccessKey ? `Issue a new door access key for ${holderName}? The old PIN keeps working until you delete it from the locks; the changes are added to Door locks.` : null
    if (question && !window.confirm(question)) return
    setIsBusy(true)
    try {
      const response = await fetch(keyUrl, { method })
      if (!response.ok) { onNotice(await readApiError(response, method === 'DELETE' ? 'Could not remove the door access key.' : 'Could not issue a door access key.')); return }
      const issued = method === 'POST' ? (await response.json() as { doorAccessKey: string }).doorAccessKey : null
      onNotice(method === 'DELETE' ? 'Door access key removed. Delete the PIN from the locks: it is on the Door locks list.' : 'Door access key issued. Add it to the locks: it is on the Door locks list.')
      onChanged(issued)
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <>
      {doorAccessKey
        ? <span className="access-key-reveal"><code>{doorAccessKey}</code><CopyButton value={doorAccessKey} label="Door access key" onNotice={onNotice} /></span>
        : revokedAt
          ? <span className="door-key-revoked" role="note">Removed automatically on {new Date(revokedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: rent overdue. Delete the PIN from the lock too (listed under Door locks).</span>
          : 'Not issued'}
      {canManage && <span className="door-key-actions">
        <button type="button" className="text-link access-key-issue" disabled={isBusy} onClick={() => void change('POST')}><KeyRound size={12} /> {doorAccessKey ? 'New door access key' : 'Generate door access key'}</button>
        {doorAccessKey && <button type="button" className="text-link access-key-issue" disabled={isBusy} onClick={() => void change('DELETE')}><Trash2 size={12} /> Remove</button>}
      </span>}
    </>
  )
}

/** The resident's own door PIN on their Door access card: hidden until tapped, since phones are read over shoulders. */
export function DoorKeyLine({ doorAccessKey, onNotice }: { doorAccessKey: string; onNotice: (message: string) => void }) {
  const [isShown, setIsShown] = useState(false)
  return (
    <span className="my-details-id door-key-line">
      <strong className="my-details-id-label">Door access key</strong>: <code>{isShown ? doorAccessKey : '••••••'}</code>
      <button type="button" className="icon-button" aria-label={isShown ? 'Hide door access key' : 'Show door access key'} title={isShown ? 'Hide door access key' : 'Show door access key'} onClick={() => setIsShown((shown) => !shown)}>{isShown ? <EyeOff size={12} /> : <Eye size={12} />}</button>
      <CopyButton value={doorAccessKey} label="Door access key" onNotice={onNotice} />
    </span>
  )
}
