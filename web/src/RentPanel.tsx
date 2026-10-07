import { useState } from 'react'
import { AlertTriangle, Gift, IndianRupee, Undo2 } from 'lucide-react'
import { formatDueDate, formatMonth, formatRupees, nextMonthToRecord, rentForMonth, type RentConcession, type RentSummary } from './rent'

/** A concession as the owner sees it: with its id, so it can be cancelled. */
export type OwnerConcession = RentConcession & { id: string }

/**
 * The owner's rent view for one resident: what is owed, which reminders went out, and "Mark paid"
 * with a per-payment Undo, and any rent concessions (cancellable until paid). Access lock is only
 * flagged here; acting on it is the owner's decision.
 */
export function RentPanel({ rent, onRecord, onUndo, concessions = [], onCancelConcession }: { rent: RentSummary; onRecord: (month: string) => Promise<string | null>; onUndo: (paymentId: string) => Promise<string | null>; /** Active discounts with their ids, e.g. referral rewards; each can be cancelled until its month is paid. */ concessions?: OwnerConcession[]; onCancelConcession?: (id: string) => Promise<string | null> }) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<string | null>) {
    setIsSaving(true)
    setError((await action()) ?? '')
    setIsSaving(false)
  }

  if (!rent.monthlyRent) return <div className="rent-panel is-muted"><IndianRupee size={14} /> No monthly rent set. Add it in Edit resident to start rent reminders.</div>

  const month = nextMonthToRecord(rent)
  const status = {
    LOCK_DUE: `Overdue for ${rent.overdueMonths.map(formatMonth).join(', ')} (${formatRupees(rent.amountDue)} outstanding${rent.lateFee ? ', including late fees' : ''}). All three reminders were shown before the due day. The resident is locked out of the app until you record the payment, unless you set an "Allow access until" date.`,
    REMINDER_3: `Reminder 3 of 3 (final) is showing: ${formatMonth(rent.currentMonth)} rent is due by ${formatDueDate(rent.currentMonth, rent.dueDay)}. The resident is locked out of the app from midnight after that if it is still unpaid.`,
    REMINDER_2: `Reminder 2 of 3 is showing: ${formatMonth(rent.currentMonth)} rent is due by ${formatDueDate(rent.currentMonth, rent.dueDay)}.`,
    REMINDER_1: `Reminder 1 of 3 is showing: ${formatMonth(rent.currentMonth)} rent is due by ${formatDueDate(rent.currentMonth, rent.dueDay)}.`,
    PAID: `Paid for ${formatMonth(rent.currentMonth)}.`,
    NOT_DUE: rent.outstandingMonths.length ? `Due by ${formatDueDate(rent.outstandingMonths[0], rent.dueDay)}.` : `Next rent is due by ${formatDueDate(month, rent.dueDay)}.`,
    NOT_TRACKED: 'Rent is not being tracked while the resident is inactive.',
  }[rent.state]

  return (
    <div className={`rent-panel is-${rent.state.toLowerCase().replace('_', '-')}`}>
      <div className="rent-panel-head">
        <strong><IndianRupee size={14} /> {formatRupees(rent.monthlyRent)} / month</strong>
        {rent.state !== 'NOT_TRACKED' && <button type="button" className={rent.state === 'LOCK_DUE' ? 'primary-button' : 'secondary-button'} disabled={isSaving} onClick={() => run(() => onRecord(month))}>Mark {formatMonth(month)} paid</button>}
      </div>
      <p className="rent-panel-status">{rent.state === 'LOCK_DUE' && <AlertTriangle size={14} />}{status}</p>
      {concessions.length > 0 && <ul className="rent-concessions">{concessions.map((concession) => <li key={concession.id}><Gift size={13} /><span><strong>{concession.percent}% off {formatMonth(concession.month)}</strong> · {formatRupees(rentForMonth(rent, concession.month))} instead of {formatRupees(rent.monthlyRent ?? 0)}{concession.reason && <small>{concession.reason}</small>}</span>{onCancelConcession && <button type="button" className="text-link" disabled={isSaving} onClick={() => { if (window.confirm(`Cancel this ${concession.percent}% discount? ${formatMonth(concession.month)} rent goes back to ${formatRupees(rent.monthlyRent ?? 0)}.`)) void run(() => onCancelConcession(concession.id)) }}>Cancel</button>}</li>)}</ul>}
      {rent.payments.length > 0 && <ul className="rent-history">{rent.payments.map((payment) => <li key={payment.id}><span>{formatMonth(payment.month)} · {formatRupees(payment.amount)} · {payment.razorpayPaymentId ? 'paid online' : 'recorded'} {new Date(payment.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>{payment.razorpayPaymentId ? <span className="status-pill sage" title={`Razorpay ${payment.razorpayPaymentId}`}>Online</span> : <button type="button" className="text-link" disabled={isSaving} onClick={() => { if (window.confirm(`Remove the ${formatMonth(payment.month)} payment?`)) void run(() => onUndo(payment.id)) }}><Undo2 size={11} /> Undo</button>}</li>)}</ul>}
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  )
}
