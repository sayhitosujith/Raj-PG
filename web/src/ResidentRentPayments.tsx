import { WalletCards } from 'lucide-react'
import { formatDueDate, formatMonth, formatRupees, nextMonthToRecord, type RentSummary } from './rent'

/**
 * The resident's own rent: anything still owed first (due or overdue), then recent payments the
 * owner has recorded. Other residents' payments are never shown here.
 */
export function ResidentRentPayments({ rent }: { rent: RentSummary }) {
  if (!rent.monthlyRent) {
    return <div className="workspace-empty"><div className="workspace-empty-icon"><WalletCards size={20} /></div><h3>Rent is not set up yet</h3><p>Your property owner has not added your monthly rent. Payments will appear here once they do.</p></div>
  }
  const monthlyRent = rent.monthlyRent
  if (!rent.outstandingMonths.length && !rent.payments.length) {
    return <div className="workspace-empty"><div className="workspace-empty-icon"><WalletCards size={20} /></div><h3>No payments recorded yet</h3><p>Your first rent of {formatRupees(monthlyRent)} is due by {formatDueDate(nextMonthToRecord(rent), rent.dueDay)}. Payments your property owner records will appear here.</p></div>
  }
  return (
    <div className="crud-list rent-payments">
      {rent.outstandingMonths.map((month) => {
        const overdue = rent.overdueMonths.includes(month)
        return <div className="crud-row" key={`due-${month}`}><div className="crud-main"><strong>{formatMonth(month)} · {formatRupees(monthlyRent + (overdue ? rent.lateFee : 0))}</strong><small>{overdue ? `Not paid yet${rent.lateFee ? ` · includes ${formatRupees(rent.lateFee)} late fee` : ''}` : `Due by ${formatDueDate(month, rent.dueDay)}`}</small></div><span className={`status-pill ${overdue ? 'coral' : 'gold'}`}>{overdue ? 'Overdue' : 'Due'}</span></div>
      })}
      {rent.payments.map((payment) => <div className="crud-row" key={payment.id}><div className="crud-main"><strong>{formatMonth(payment.month)} · {formatRupees(payment.amount)}</strong><small>{payment.razorpayPaymentId ? 'Paid online' : 'Recorded'} {new Date(payment.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><span className="status-pill sage">Paid</span></div>)}
    </div>
  )
}
