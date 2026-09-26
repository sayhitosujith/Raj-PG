import { AlertTriangle, BellRing, IndianRupee } from 'lucide-react'
import { formatDueDate, formatMonth, formatRupees, ordinal, type RentSummary } from './rent'

/** Prominent monthly rent card for the resident's "My details": amount, due day, and this month's state. */
export function RentHighlight({ rent }: { rent: RentSummary }) {
  if (!rent.monthlyRent) return null
  const status = rent.state === 'LOCK_DUE' ? { label: `Overdue · ${formatRupees(rent.amountDue)}`, tone: 'coral' }
    : rent.state === 'PAID' ? { label: `${formatMonth(rent.currentMonth)} paid`, tone: 'sage' }
    : rent.outstandingMonths.length ? { label: `Due by ${formatDueDate(rent.outstandingMonths[0], rent.dueDay)}`, tone: 'gold' }
    : { label: 'Nothing due yet', tone: 'muted' }
  return (
    <div className={`rent-highlight is-${status.tone}`}>
      <span className="rent-highlight-icon"><IndianRupee size={20} /></span>
      <div className="rent-highlight-copy">
        <p className="eyebrow">Monthly rent</p>
        <strong>{formatRupees(rent.monthlyRent)}<small> / month</small></strong>
        <span>Due by the {ordinal(rent.dueDay)} of every month</span>
      </div>
      <span className={`rent-highlight-status ${status.tone}`}>{status.label}</span>
    </div>
  )
}

/** The resident's rent reminders: two on the 1st and 2nd, then an overdue notice from the 3rd. */
export function RentBanner({ rent }: { rent: RentSummary }) {
  if (!rent.monthlyRent) return null
  if (rent.state === 'REMINDER_1' || rent.state === 'REMINDER_2') {
    const isFinal = rent.state === 'REMINDER_2'
    return (
      <div className="rent-banner is-reminder" role="status">
        <BellRing size={18} />
        <div><strong>Rent reminder {isFinal ? '2' : '1'} of 2</strong><p>{formatRupees(rent.monthlyRent)} for {formatMonth(rent.currentMonth)} is due {isFinal ? 'today' : `tomorrow, ${formatDueDate(rent.currentMonth, rent.dueDay)}`}. Please pay your property owner.</p></div>
      </div>
    )
  }
  if (rent.state === 'LOCK_DUE') {
    return (
      <div className="rent-banner is-overdue" role="alert">
        <AlertTriangle size={18} />
        <div><strong>Your rent is overdue</strong><p>{formatRupees(rent.amountDue)} outstanding for {rent.overdueMonths.map(formatMonth).join(', ')}. Please pay your property owner today. Until the payment is recorded, new housekeeping requests are paused and your property owner may restrict door access.</p></div>
      </div>
    )
  }
  return null
}
