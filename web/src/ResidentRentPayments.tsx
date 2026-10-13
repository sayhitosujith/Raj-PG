import { Download, WalletCards } from 'lucide-react'
import { formatDueDate, formatMonth, formatRupees, nextMonthToRecord, rentForMonth, type RentSummary } from './rent'
import type { UpiClaim } from './UpiDirectPay'

/**
 * The resident's own rent: a payment they reported that awaits the owner first (no receipt until it
 * is approved), then anything still owed (due or overdue), then recent payments the owner has
 * recorded, each with a PDF receipt. Other residents' payments are never shown here.
 */
export function ResidentRentPayments({ rent, pendingClaim }: { rent: RentSummary; pendingClaim: UpiClaim | null }) {
  const pendingRow = pendingClaim && <PendingClaimRow claim={pendingClaim} />
  if (!rent.monthlyRent) {
    if (pendingRow) return <div className="crud-list rent-payments">{pendingRow}</div>
    return <div className="workspace-empty"><div className="workspace-empty-icon"><WalletCards size={20} /></div><h3>Rent is not set up yet</h3><p>Your property owner has not added your monthly rent. Payments will appear here once they do.</p></div>
  }
  const monthlyRent = rent.monthlyRent
  // Months the reported payment covers show once, as pending, not again as due.
  const claimedMonths = pendingClaim?.rentMonths?.map((item) => item.month) ?? []
  const owedMonths = rent.outstandingMonths.filter((month) => !claimedMonths.includes(month))
  if (!pendingRow && !owedMonths.length && !rent.payments.length) {
    return <div className="workspace-empty"><div className="workspace-empty-icon"><WalletCards size={20} /></div><h3>No payments recorded yet</h3><p>Your first rent of {formatRupees(monthlyRent)} is due by {formatDueDate(nextMonthToRecord(rent), rent.dueDay)}. Payments your property owner records will appear here.</p></div>
  }
  return (
    <div className="crud-list rent-payments">
      {pendingRow}
      {owedMonths.map((month) => {
        const overdue = rent.overdueMonths.includes(month)
        return <div className="crud-row" key={`due-${month}`}><div className="crud-main"><strong>{formatMonth(month)} · {formatRupees(rentForMonth(rent, month) + (overdue ? rent.lateFee : 0))}</strong><small>{overdue ? `Not paid yet${rent.lateFee ? ` · includes ${formatRupees(rent.lateFee)} late fee` : ''}` : `Due by ${formatDueDate(month, rent.dueDay)}`}</small></div><span className={`status-pill ${overdue ? 'coral' : 'gold'}`}>{overdue ? 'Overdue' : 'Due'}</span></div>
      })}
      {rent.payments.map((payment) => <div className="crud-row" key={payment.id}><div className="crud-main"><strong>{formatMonth(payment.month)} · {formatRupees(payment.amount)}</strong><small>{payment.razorpayPaymentId ? 'Paid online' : 'Recorded'} {formatDay(payment.paidAt)}</small></div><div className="rent-payment-actions"><span className="status-pill sage">Paid</span><a className="secondary-button receipt-button" href={`/api/resident-portal/rent/receipts/${payment.id}`} download><Download size={13} /> Receipt</a></div></div>)}
    </div>
  )
}

// The resident's reported UPI payment: the months it covers (or just "Payment" with no rent set up), when it
// was reported and the UTR. It becomes a recorded payment with a receipt once the owner approves it.
function PendingClaimRow({ claim }: { claim: UpiClaim }) {
  const months = claim.rentMonths?.length ? claim.rentMonths.map((item) => formatMonth(item.month)).join(', ') : 'Payment'
  return (
    <div className="crud-row">
      <div className="crud-main"><strong>{months} · {formatRupees(claim.amount)}</strong><small>Reported {formatDay(claim.createdAt)}{claim.reference ? ` · UPI ref ${claim.reference}` : ''} · waiting for your property owner</small></div>
      <span className="status-pill gold">Pending approval</span>
    </div>
  )
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
