import { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardList, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import type { Resident } from './resident'
import { formatRupees, paymentMethodLabels, paymentStatusLabels, type Payment } from './payment'
import { PaymentFormModal } from './PaymentFormModal'
import { PaymentQrModal } from './PaymentQrModal'
import { FinanceOverview } from './FinanceOverview'
import { Pagination } from './Pagination'
import { usePagination } from './usePagination'
import { formatMonth } from './rent'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'

type PropertyOption = { id: string; name: string }

const statusTone = { paid: 'sage', pending: 'gold', failed: 'muted' } as const

async function fetchPayments() {
  const response = await fetch('/api/payments')
  if (!response.ok) throw new Error('Payments request failed')
  return await response.json() as Payment[]
}

/** The owner's hand-recorded payments: who paid, how, how much, for which property. */
export function PaymentsView({ properties, residents, refreshSignal, onBack, onNotice }: { properties: PropertyOption[]; residents: Resident[]; refreshSignal: number; onBack: () => void; onNotice: (message: string) => void }) {
  const [payments, setPayments] = useState<Payment[]>([])
  // Bumped on every payment change so the finance summary below follows the list.
  const [financeVersion, setFinanceVersion] = useState(0)
  // undefined: closed; null: adding; a payment: editing it.
  const [editing, setEditing] = useState<Payment | null | undefined>(undefined)
  const pager = usePagination(payments)
  const [collecting, setCollecting] = useState<Payment | null>(null)

  const upsert = useCallback((payment: Payment) => { setFinanceVersion((value) => value + 1); setPayments((current) => current.some((item) => item.id === payment.id) ? current.map((item) => item.id === payment.id ? payment : item) : [payment, ...current]) }, [])

  useEffect(() => { fetchPayments().then(setPayments).catch(() => onNotice('Payments could not be loaded.')) }, [onNotice])
  useRefreshSignal(refreshSignal, () => { fetchPayments().then(setPayments).catch(() => undefined) })

  function saved(payment: Payment, showQr: boolean) {
    upsert(payment)
    if (!showQr) onNotice(editing ? 'Payment updated.' : 'Payment added.')
    setEditing(undefined)
    if (showQr) setCollecting(payment)
  }

  // A resident's UPI report (rentMonths set) is money sent to your UPI ID: check it in your bank app
  // first, since confirming it also records their rent.
  async function markPaid(payment: Payment) {
    const isReport = payment.rentMonths !== null
    const check = payment.reference ? ` Check UPI reference ${payment.reference} in your bank app first.` : isReport ? ' Check your bank app for this transfer first.' : ''
    const rent = payment.rentMonths?.length ? ` Rent for ${payment.rentMonths.map((item) => formatMonth(item.month)).join(', ')} will be recorded.` : ''
    const question = `Mark ${formatRupees(payment.amount)} from ${payment.payerName} as paid?${check}${rent}`
    if (!window.confirm(question)) return
    const { status: _status, id: _id, property: _property, createdAt: _createdAt, ...fields } = payment
    const response = await fetch(`/api/payments/${payment.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, status: 'paid' }) }).catch(() => null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Payment could not be updated.') : 'Could not reach the server.'); return }
    upsert(await response.json() as Payment)
    onNotice('Payment marked as paid.')
  }

  async function remove(payment: Payment) {
    if (!window.confirm(`Delete the ${formatRupees(payment.amount)} payment from ${payment.payerName}?`)) return
    const response = await fetch(`/api/payments/${payment.id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) { onNotice('Payment could not be deleted.'); return }
    setPayments((current) => current.filter((item) => item.id !== payment.id))
    setFinanceVersion((value) => value + 1)
    onNotice('Payment deleted.')
  }

  return (
    <section className="workspace-view crud-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Workspace module</p><h2>Payments</h2><p>Record payments received by cash, UPI, bank transfer, cheque or card.</p></div><div className="view-actions"><button className="primary-button" onClick={() => setEditing(null)}><Plus size={16} /> Add payment</button><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>
      <div className="crud-list">
        {payments.length ? pager.pageItems.map((payment) => (
          <div className="crud-row" key={payment.id}>
            <div className="crud-main">
              <strong>{payment.payerName || 'Unnamed payer'} · {formatRupees(payment.amount)}</strong>
              <small>{[payment.phone, paymentMethodLabels[payment.method] ?? payment.method, payment.bankName, payment.reference && `UTR ${payment.reference}`, payment.property, new Date(payment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</small>
            </div>
            <div className="crud-actions">
              <span className={`status-pill ${statusTone[payment.status] ?? 'muted'}`}>{paymentStatusLabels[payment.status] ?? payment.status}</span>
              {payment.status === 'pending' && !payment.razorpayQrId && <button className="secondary-button" onClick={() => markPaid(payment)}><Check size={13} /> Mark paid</button>}
              {payment.method === 'upi' && payment.status !== 'paid' && payment.rentMonths === null && <button className="secondary-button" onClick={() => setCollecting(payment)}><QrCode size={13} /> UPI QR</button>}
              <button className="secondary-button" onClick={() => setEditing(payment)}><Pencil size={13} /> Edit</button>
              <button className="row-delete" aria-label={`Delete payment from ${payment.payerName}`} onClick={() => remove(payment)}><Trash2 size={14} /></button>
            </div>
          </div>
        )) : <div className="workspace-empty"><div className="workspace-empty-icon"><ClipboardList size={22} /></div><h3>No payments yet</h3><p>Add the first payment to start tracking what has been collected.</p></div>}
      </div>
      <Pagination state={pager} label="Payments" />
      <FinanceOverview properties={properties} version={financeVersion} refreshSignal={refreshSignal} onNotice={onNotice} />
      {collecting && <PaymentQrModal payment={collecting} onClose={() => setCollecting(null)} onUpdated={upsert} />}
      {editing !== undefined && <PaymentFormModal payment={editing ?? undefined} properties={properties} residents={residents} onClose={() => setEditing(undefined)} onSaved={saved} />}
    </section>
  )
}
