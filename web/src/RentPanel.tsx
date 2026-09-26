import { useState } from 'react'
import { AlertTriangle, IndianRupee, Undo2 } from 'lucide-react'
import { formatDueDate, formatMonth, formatRupees, nextMonthToRecord, type RentSummary } from './rent'

/**
 * The owner's rent view for one resident: what is owed, which reminders went out, and "Mark paid"
 * with a per-payment Undo. Access lock is only flagged here; acting on it is the owner's decision.
 */
export function RentPanel({ rent, onRecord, onUndo }: { rent: RentSummary; onRecord: (month: string) => Promise<string | null>; onUndo: (paymentId: string) => Promise<string | null> }) {
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
    LOCK_DUE: `Overdue for ${rent.overdueMonths.map(formatMonth).join(', ')} (${formatRupees(rent.amountDue)} outstanding). Both reminders were shown before the due day. Door access lock is due: this is your call. The resident's portal is limited until you record the payment.`,
    REMINDER_2: `Reminder 2 of 2 is showing: ${formatMonth(rent.currentMonth)} rent is due by ${formatDueDate(rent.currentMonth, rent.dueDay)}.`,
    REMINDER_1: `Reminder 1 of 2 is showing: ${formatMonth(rent.currentMonth)} rent is due by ${formatDueDate(rent.currentMonth, rent.dueDay)}.`,
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
      {rent.payments.length > 0 && <ul className="rent-history">{rent.payments.map((payment) => <li key={payment.id}><span>{formatMonth(payment.month)} · {formatRupees(payment.amount)} · recorded {new Date(payment.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><button type="button" className="text-link" disabled={isSaving} onClick={() => { if (window.confirm(`Remove the ${formatMonth(payment.month)} payment?`)) void run(() => onUndo(payment.id)) }}><Undo2 size={11} /> Undo</button></li>)}</ul>}
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  )
}
