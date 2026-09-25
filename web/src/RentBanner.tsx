import { AlertTriangle, BellRing } from 'lucide-react'
import { formatDueDate, formatMonth, formatRupees, type RentSummary } from './rent'

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
