import { useState } from 'react'
import { DoorOpen, X } from 'lucide-react'
import { formatMonth, formatRupees } from './rent'
import type { ExitDues } from './resident'
import { readApiError } from './superAdmin'

/** The resident's move-out notice as the portal receives it. */
export type ExitNotice = { status: 'PENDING' | 'APPROVED' | 'DECLINED' | null; date: string | null; reason: string | null; /** Notice period for the resident's property (its own, or Settings). */ noticeDays: number; earliestDate: string; dues: ExitDues | null }

const shortDate = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** Deposit + the unused part of a paid move-out month − dues still to pay. */
export const refundEstimate = (dues: ExitDues, deposit: number | null) => (deposit ?? 0) + dues.unusedCredit - dues.total

/**
 * The move-out settlement. Before a date is chosen (the resident's form) it is rent due now against
 * the deposit; once there is a date it shows the per-day charge for the move-out month (days from
 * the 1st × rate, capped at the month's rent), the unused part of a paid month, dues, deposit and
 * the refund estimate. Shared by the resident's and the owner's views.
 */
export function ExitSettlement({ deposit, dues, amountDue = 0 }: { deposit: number | null; dues?: ExitDues | null; amountDue?: number }) {
  if (!dues?.exitMonth) {
    const balance = (deposit ?? 0) - amountDue
    return (
      <dl className="exit-settlement">
        <div><dt>Rent due now</dt><dd>{formatRupees(amountDue)}</dd></div>
        <div><dt>Security deposit</dt><dd>{deposit ? formatRupees(deposit) : 'None set'}</dd></div>
        <div className={balance >= 0 ? 'is-refund' : 'is-owed'}><dt>{balance >= 0 ? 'Refund estimate' : 'Still to pay'}</dt><dd>{formatRupees(Math.abs(balance))}</dd></div>
      </dl>
    )
  }
  const refund = refundEstimate(dues, deposit)
  const isCapped = dues.daysStayed * dues.dailyRate > dues.dayCharge
  return (
    <>
      <p className="exit-day-charge">Stayed <strong>{dues.daysStayed} {dues.daysStayed === 1 ? 'day' : 'days'}</strong> in {formatMonth(dues.exitMonth)} × {formatRupees(dues.dailyRate)}/day = <strong>{formatRupees(dues.dayCharge)}</strong>{isCapped ? " (capped at the month's rent)" : ''}{dues.isExitMonthPaid ? ` · ${formatMonth(dues.exitMonth)} paid ${formatRupees(dues.exitMonthPaid)} − ${formatRupees(dues.dayCharge)} used = ${formatRupees(dues.unusedCredit)} unused` : ''}</p>
      <dl className="exit-settlement is-four">
        <div className={dues.total > 0 ? 'is-owed' : undefined}><dt>Dues to clear</dt><dd>{formatRupees(dues.total)}</dd></div>
        <div><dt>Unused rent</dt><dd>{formatRupees(dues.unusedCredit)}</dd></div>
        <div><dt>Security deposit</dt><dd>{deposit ? formatRupees(deposit) : 'None set'}</dd></div>
        <div className={refund >= 0 ? 'is-refund' : 'is-owed'}><dt>{refund >= 0 ? 'Refund estimate' : 'Still to pay'}</dt><dd>{formatRupees(Math.abs(refund))}</dd></div>
      </dl>
    </>
  )
}

/** The months still to pay before a move-out can be approved, e.g. "November 2026 · ₹12,000". */
export function DuesList({ dues }: { dues: ExitDues }) {
  if (!dues.months.length) return <p className="exit-dues-clear">No dues up to the move-out date.</p>
  return <ul className="exit-dues-list">{dues.months.map((item) => <li key={item.month}><span>{formatMonth(item.month)}</span><strong>{formatRupees(item.amount)}</strong></li>)}</ul>
}

/**
 * "Exit PG" in the resident's My Details: give notice with a move-out date (at least the notice
 * period away) and an optional reason, see the deposit settlement, then follow the owner's decision.
 * A pending request can be withdrawn; approved ones are completed by the owner on the day.
 */
export function ExitPg({ exit, amountDue, deposit, noticeDays, onChanged, onNotice }: { exit: ExitNotice; amountDue: number; deposit: number | null; noticeDays: number; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function send(request: Promise<Response>, success: string) {
    setIsSaving(true)
    setError('')
    try {
      const response = await request
      if (!response.ok) { setError(await readApiError(response, 'Could not update your move-out request.')); return false }
      onNotice(success)
      await onChanged()
      return true
    } catch {
      setError('Could not reach the server.')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const moveOutDate = String(form.get('moveOutDate') ?? '')
    if (await send(fetch('/api/resident-portal/exit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moveOutDate, reason: form.get('reason') }) }), `Move-out request sent for ${shortDate(moveOutDate)}.`)) setIsOpen(false)
  }

  function cancel() {
    const question = exit.status === 'APPROVED' ? 'Cancel your approved move-out? You will stay, and need to send a new request to move out later.' : 'Cancel your move-out request?'
    if (window.confirm(question)) void send(fetch('/api/resident-portal/exit', { method: 'DELETE' }), 'Move-out request cancelled.')
  }

  if (exit.status === 'APPROVED' && exit.date) {
    // Deposit + unused rent − dues: refunded on the exit day, or still to pay if negative.
    const refund = exit.dues ? refundEstimate(exit.dues, deposit) : deposit ?? 0
    return (
      <div className="exit-status-row">
        <p className="exit-status is-approved"><DoorOpen size={14} /> Moving out on <strong>{shortDate(exit.date)}</strong> · approved</p>
        {refund > 0 && <p className="exit-refund-note">You will be refunded <strong>{formatRupees(refund)}</strong> on {shortDate(exit.date)}, the date of your exit.</p>}
        {refund < 0 && <p className="exit-dues-note">Please pay {formatRupees(-refund)} before you leave on {shortDate(exit.date)}.</p>}
        <p className="exit-signin-note">You cannot sign in after your date of exit ({shortDate(exit.date)}). If you still need to sign in after that, contact your property owner for a new access key.</p>
        <button type="button" className="text-link" disabled={isSaving} onClick={cancel}>Cancel move-out</button>
        {error && <p className="login-error" role="alert">{error}</p>}
      </div>
    )
  }
  if (exit.status === 'PENDING' && exit.date) {
    return (
      <div className="exit-status-row">
        <p className="exit-status"><DoorOpen size={14} /> Move-out requested for <strong>{shortDate(exit.date)}</strong> · awaiting approval</p>
        {exit.dues?.exitMonth && <p className="exit-refund-note">{exit.dues.daysStayed} {exit.dues.daysStayed === 1 ? 'day' : 'days'} in {formatMonth(exit.dues.exitMonth)} × {formatRupees(exit.dues.dailyRate)} = {formatRupees(exit.dues.dayCharge)} · refund estimate <strong>{formatRupees(Math.max(0, refundEstimate(exit.dues, deposit)))}</strong></p>}
        {exit.dues && exit.dues.total > 0 && <p className="exit-dues-note">Pay {formatRupees(exit.dues.total)} in rent up to your move-out date ({exit.dues.months.map((item) => formatMonth(item.month)).join(', ')}) so your property owner can approve it.</p>}
        <button type="button" className="text-link" disabled={isSaving} onClick={cancel}>Cancel request</button>
        {error && <p className="login-error" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <>
      <div className="exit-status-row">
        {exit.status === 'DECLINED' && <p className="exit-status is-declined">Your last move-out request was declined.</p>}
        <button type="button" className="exit-pg-button" onClick={() => setIsOpen(true)}><DoorOpen size={14} /> Exit PG</button>
      </div>
      {isOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)}>
        <form className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="exit-pg-title" onSubmit={submit}>
          <div className="modal-heading"><div><p className="eyebrow">Move out</p><h2 id="exit-pg-title">Exit PG</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setIsOpen(false)}><X size={18} /></button></div>
          <p className="exit-hint">The notice period is {noticeDays} {noticeDays === 1 ? 'day' : 'days'}, so the earliest move-out date is {shortDate(exit.earliestDate)}. Your property owner will approve the date.</p>
          <label>Move-out date<input name="moveOutDate" type="date" required min={exit.earliestDate} defaultValue={exit.earliestDate} /></label>
          <label>Reason <span>(optional)</span><textarea name="reason" rows={3} maxLength={300} placeholder="e.g. Moving to another city for work" /></label>
          <ExitSettlement amountDue={amountDue} deposit={deposit} />
          <p className="exit-hint">Your last month is charged per day from the 1st (move-out day included), never more than a month's rent; the unused part of a paid month is refunded with your deposit.</p>
          <p className="exit-hint">An estimate from today's dues; rent until your move-out date and any damages are settled with your property owner.</p>
          {error && <p className="login-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}><DoorOpen size={15} /> {isSaving ? 'Sending…' : 'Send move-out request'}</button></div>
        </form>
      </div>}
    </>
  )
}
