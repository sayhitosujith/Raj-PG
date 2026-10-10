import { useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import type { Resident } from './resident'
import { formatRupees } from './rent'
import { readApiError } from './superAdmin'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** Header badge for a resident who asked to delete their account, or whose account was closed. */
export function deletionBadge(resident: Resident) {
  if (resident.deletedAt) return resident.deletedByName ? { label: `Removed by ${resident.deletedByName}`, tone: 'muted' } : { label: 'Closed at their request', tone: 'muted' }
  if (resident.deletionRequestedAt) return { label: 'Deletion requested', tone: 'coral' }
  return null
}

/**
 * The owner's decision on a resident's "Delete my account" request, in the expanded resident row.
 * Dues do not block approval (the owner may write them off), so they are shown beside the buttons.
 * Approval closes the account for good, so it asks for confirmation first; declining asks
 * for a reason, which the resident sees. Styled like the move-out panel above it, since both are
 * requests waiting on the owner.
 */
export function AccountDeletionReview({ resident, onChanged, onNotice }: { resident: Resident; onChanged: () => void; onNotice: (message: string) => void }) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  // Declining needs a reason for the resident, typed in a box that opens under the buttons.
  const [isDeclining, setIsDeclining] = useState(false)
  const [reason, setReason] = useState('')
  if (!resident.deletionRequestedAt || resident.deletedAt) return null
  const amountDue = resident.rent.amountDue

  async function decide(decision: 'approve' | 'decline') {
    if (decision === 'approve' && !window.confirm(`Delete ${resident.name}'s account? They are moved out and signed out for good, and the account moves to Deleted records with all its details. This cannot be undone.`)) return
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/residents/${resident.id}/deletion/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, ...(decision === 'decline' ? { reason } : {}) }) })
      if (!response.ok) { setError(await readApiError(response, 'Could not save the decision.')); return }
      onNotice(decision === 'approve' ? `${resident.name}'s account was deleted.` : `Declined ${resident.name}'s deletion request.`)
      onChanged()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="resident-exit-panel is-deletion">
      <div className="resident-exit-head"><Trash2 size={16} /><div><strong>Account deletion request</strong><small>Asked on {shortDate(resident.deletionRequestedAt)}</small></div></div>
      <p className={`resident-exit-payout${amountDue > 0 ? ' is-owed' : ''}`}>{amountDue > 0 ? <>{resident.name} still owes <strong>{formatRupees(amountDue)}</strong> in rent</> : <>No rent due</>}<small>Approving closes the account and moves them out; their full record moves to Deleted records.</small></p>
      {isDeclining
        ? <form className="deletion-decline" onSubmit={(event) => { event.preventDefault(); void decide('decline') }}>
            <label>Reason for declining <span>(shown to {resident.name})</span><textarea value={reason} required maxLength={300} rows={2} autoFocus placeholder="e.g. Please clear your dues and hand over the room keys first." onChange={(event) => setReason(event.target.value)} /></label>
            <div className="resident-exit-actions">
              <button type="submit" className="danger-button" disabled={isSaving || !reason.trim()}><X size={14} /> Decline request</button>
              <button type="button" className="secondary-button" disabled={isSaving} onClick={() => { setIsDeclining(false); setReason('') }}>Cancel</button>
            </div>
          </form>
        : <div className="resident-exit-actions">
            <button type="button" className="danger-button" disabled={isSaving} onClick={() => void decide('approve')}><Check size={14} /> Approve and delete</button>
            <button type="button" className="secondary-button" disabled={isSaving} onClick={() => setIsDeclining(true)}><X size={14} /> Decline</button>
          </div>}
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  )
}
