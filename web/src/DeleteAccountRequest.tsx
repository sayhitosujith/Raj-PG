import { useState } from 'react'
import { CheckCircle2, Trash2 } from 'lucide-react'
import { readApiError } from './superAdmin'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * "Delete my account" at the foot of the resident's profile. It only sends a request: the owner
 * approves it (erasing the account) or declines it, so a mistaken tap is never final and the owner
 * can settle any rent first. While it waits, the resident can withdraw it; after a decline it says so
 * until they ask again. (Approval signs them out with its own explanation.) The outcome is shown in
 * the card as well as the toast, so it is not missed.
 */
export function DeleteAccountRequest({ requestedAt, declinedAt, declineReason, onChanged, onNotice }: { requestedAt?: string | null; declinedAt?: string | null; declineReason?: string | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function send(method: 'POST' | 'DELETE') {
    if (method === 'POST' && !window.confirm('Ask your property owner to delete your account? Once they approve, your details are erased, you are moved out and you cannot sign in again.')) return
    setIsSaving(true)
    setResult(null)
    try {
      const response = await fetch('/api/resident-portal/deletion-request', { method })
      if (!response.ok) {
        const message = await readApiError(response, 'Could not update your request.')
        setResult({ ok: false, message })
        onNotice(message)
        return
      }
      const message = method === 'POST' ? 'Request sent. Your property owner will review it; once they approve, you are signed out.' : 'Deletion request cancelled.'
      setResult({ ok: true, message })
      onNotice(message)
      await onChanged()
    } catch {
      setResult({ ok: false, message: 'Could not reach the server.' })
      onNotice('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <h3 className="danger-zone-title">Danger Zone</h3>
      <section className="delete-account">
        <div className="delete-account-copy">
          <strong>Delete account</strong>
          {requestedAt
            ? <small>You asked on {shortDate(requestedAt)}. Waiting for your property owner to approve.</small>
            : declinedAt ? <small className="delete-account-declined">Your property owner declined your request on {shortDate(declinedAt)}{declineReason ? <>: “{declineReason}”</> : '.'} Contact them if you still want your account deleted, or ask again.</small>
            : <small>Ask your property owner to erase your account and personal details. They approve it first.</small>}
        </div>
        {requestedAt
          ? <button type="button" className="secondary-button" disabled={isSaving} onClick={() => void send('DELETE')}>Cancel request</button>
          : <button type="button" className="delete-account-button" disabled={isSaving} onClick={() => void send('POST')}><Trash2 size={14} /> {isSaving ? 'Sending…' : 'Delete account'}</button>}
        {result && <p className={`delete-account-result${result.ok ? ' is-ok' : ''}`} role={result.ok ? 'status' : 'alert'}>{result.ok && <CheckCircle2 size={14} />}{result.message}</p>}
      </section>
    </>
  )
}
