import { useState } from 'react'
import { Check, DoorOpen, X } from 'lucide-react'
import { DuesList, ExitSettlement, refundEstimate } from './ExitPg'
import { formatRupees } from './rent'
import type { Resident } from './resident'
import { readApiError } from './superAdmin'
import { todayDateInputValue } from './joinDate'

const longDate = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

// "Refund ₹14,500" or "owes ₹2,000" for an open move-out; empty when there are no figures yet.
function refundLabel(resident: Resident, deposit: number | null) {
  if (!resident.exitDues) return ''
  const amount = refundEstimate(resident.exitDues, deposit)
  return amount >= 0 ? ` · refund ${formatRupees(amount)}` : ` · owes ${formatRupees(-amount)}`
}

/** The row badge for a move-out notice (with the refund to pay), or null when there is none open. */
export function exitBadge(resident: Resident, deposit: number | null) {
  if (!resident.exitDate) return null
  const date = new Date(`${resident.exitDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
  if (resident.movedOutAt) return { label: 'Moved out', tone: 'muted' }
  if (resident.exitStatus === 'PENDING') return { label: `Move-out request · ${date}${refundLabel(resident, deposit)}`, tone: 'gold' }
  if (resident.exitStatus === 'APPROVED') return { label: `Moving out ${date}${refundLabel(resident, deposit)}`, tone: 'coral' }
  return null
}

/**
 * The owner's view of a resident's move-out notice in the expanded row: date, reason, the deposit
 * settlement, Approve / Decline while pending, then Complete move-out from the date (frees the room,
 * keeps their history). Once moved out it shows when and from where. Hidden when there is no notice.
 */
export function ResidentExitPanel({ resident, deposit, onChanged, onNotice }: { resident: Resident; deposit: number | null; onChanged: () => void; onNotice: (message: string) => void }) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  if (resident.movedOutAt) return <div className="resident-exit-panel is-done"><div className="resident-exit-head"><DoorOpen size={16} /><div><strong>Moved out</strong><small>{new Date(resident.movedOutAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}{resident.movedOutFrom ? ` · from ${resident.movedOutFrom}` : ''}</small></div></div></div>
  if (!resident.exitDate || (resident.exitStatus !== 'PENDING' && resident.exitStatus !== 'APPROVED')) return null
  const isDue = resident.exitDate.slice(0, 10) <= todayDateInputValue()
  const dues = resident.exitDues ?? { total: 0, months: [], exitMonth: null, daysStayed: 0, dailyRate: 0, dayCharge: 0, isExitMonthPaid: false, exitMonthPaid: 0, unusedCredit: 0 }
  // What the owner hands back at move-out: deposit + unused rent − dues (negative means the resident owes).
  const payout = refundEstimate(dues, deposit)

  async function changeDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const moveOutDate = String(new FormData(event.currentTarget).get('moveOutDate') ?? '')
    if (!moveOutDate || moveOutDate === resident.exitDate?.slice(0, 10)) return
    setIsSaving(true)
    setError('')
    const response = await fetch(`/api/residents/${resident.id}/exit/date`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moveOutDate }) }).catch(() => null)
    setIsSaving(false)
    if (!response) { setError('Could not reach the server.'); return }
    if (!response.ok) { setError(await readApiError(response, 'Could not change the date.')); return }
    onNotice(`Move-out date for ${resident.name} changed to ${longDate(moveOutDate)}; they have been emailed.`)
    onChanged()
  }

  async function complete() {
    if (!window.confirm(`Complete ${resident.name}'s move-out? They will be signed out and set inactive, and room ${resident.room} becomes free. Their rent history is kept.`)) return
    setIsSaving(true)
    setError('')
    const response = await fetch(`/api/residents/${resident.id}/exit/complete`, { method: 'POST' }).catch(() => null)
    setIsSaving(false)
    if (!response) { setError('Could not reach the server.'); return }
    if (!response.ok) { setError(await readApiError(response, 'Could not complete the move-out.')); return }
    onNotice(`${resident.name} has moved out; room ${resident.room} is free.`)
    onChanged()
  }

  async function decide(decision: 'approve' | 'decline') {
    if (decision === 'decline' && !window.confirm(`Decline ${resident.name}'s move-out request? They will be emailed and can send a new one.`)) return
    setIsSaving(true)
    setError('')
    const response = await fetch(`/api/residents/${resident.id}/exit/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) }).catch(() => null)
    setIsSaving(false)
    if (!response) { setError('Could not reach the server.'); return }
    if (!response.ok) { setError(await readApiError(response, 'Could not save the decision.')); return }
    onNotice(decision === 'approve' ? `Move-out approved for ${resident.name}.` : `Move-out request declined for ${resident.name}.`)
    onChanged()
  }

  return (
    <div className={`resident-exit-panel${resident.exitStatus === 'APPROVED' ? ' is-approved' : ''}`}>
      <div className="resident-exit-head"><DoorOpen size={16} /><div><strong>{resident.exitStatus === 'PENDING' ? 'Move-out request' : 'Moving out (approved)'}</strong><small>{longDate(resident.exitDate)}{resident.exitReason ? ` · “${resident.exitReason}”` : ''}</small></div></div>
      <p className={`resident-exit-payout${payout < 0 ? ' is-owed' : ''}`}>{payout >= 0 ? <>You pay {resident.name} <strong>{formatRupees(payout)}</strong></> : <>{resident.name} still owes <strong>{formatRupees(-payout)}</strong></>}<small>{payout >= 0 ? 'Deposit plus unused rent, once all dues are cleared.' : 'Dues are more than the deposit and unused rent.'}</small></p>
      <ExitSettlement deposit={deposit} dues={dues} />
      <DuesList dues={dues} />
      {resident.exitStatus === 'PENDING' && <div className="resident-exit-actions">
        <button type="button" className="primary-button" disabled={isSaving || dues.total > 0} title={dues.total > 0 ? 'Record the unpaid rent first' : undefined} onClick={() => void decide('approve')}><Check size={14} /> Approve</button>
        <button type="button" className="secondary-button" disabled={isSaving} onClick={() => void decide('decline')}><X size={14} /> Decline</button>
        {dues.total > 0 && <small className="resident-exit-wait">Clear {formatRupees(dues.total)} in dues to approve: mark those months paid above.</small>}
      </div>}
      {resident.exitStatus === 'APPROVED' && <div className="resident-exit-actions">
        <button type="button" className="primary-button" disabled={isSaving || !isDue} title={isDue ? undefined : 'Available on the move-out date'} onClick={() => void complete()}><DoorOpen size={14} /> Complete move-out</button>
        {!isDue && <small className="resident-exit-wait">Available from {longDate(resident.exitDate)}</small>}
      </div>}
      <form className="resident-exit-date" onSubmit={(event) => void changeDate(event)}>
        <label>Change move-out date<input name="moveOutDate" type="date" required min={todayDateInputValue()} defaultValue={resident.exitDate.slice(0, 10)} key={resident.exitDate} /></label>
        <button type="submit" className="secondary-button" disabled={isSaving}>Save date</button>
      </form>
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  )
}
