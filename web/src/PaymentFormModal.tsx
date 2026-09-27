import { useState } from 'react'
import { Plus, QrCode, X } from 'lucide-react'
import type { Resident } from './resident'
import { paymentMethodLabels, paymentStatusLabels, type Payment, type PaymentDraft, type PaymentMethod, type PaymentStatus } from './payment'
import { readApiError } from './superAdmin'

type PropertyOption = { id: string; name: string }

const emptyDraft: PaymentDraft = { amount: '', status: 'paid', method: 'cash', payerName: '', phone: '', bankName: '', propertyId: '', residentId: null }

function draftOf(payment?: Payment): PaymentDraft {
  if (!payment) return emptyDraft
  const { status, method, payerName, phone, bankName, propertyId, residentId, amount } = payment
  return { status, method, payerName, phone, bankName, propertyId, residentId, amount: String(amount) }
}

/**
 * Add or edit a recorded payment. Picking a resident fills in their name and phone, which stay
 * editable; "Someone else" leaves them blank for payers who are not residents.
 */
export function PaymentFormModal({ payment, properties, residents, onClose, onSaved }: { payment?: Payment; properties: PropertyOption[]; residents: Resident[]; onClose: () => void; onSaved: (payment: Payment, showQr: boolean) => void }) {
  const [draft, setDraft] = useState(() => draftOf(payment))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const propertyResidents = residents.filter((resident) => resident.propertyId === draft.propertyId)
  const update = (fields: Partial<PaymentDraft>) => setDraft((current) => ({ ...current, ...fields }))
  // Razorpay owns the amount, type and status of a QR payment (the server enforces this too).
  const isQrPayment = Boolean(payment?.razorpayQrId)
  const canShowQr = draft.method === 'upi' && !isQrPayment && draft.status !== 'paid'

  function chooseResident(residentId: string) {
    const resident = residents.find((item) => item.id === residentId)
    update(resident ? { residentId, payerName: resident.name, phone: resident.phone ?? '' } : { residentId: null, payerName: '', phone: '' })
  }

  // The "Save & show UPI QR" button saves the payment as pending; Razorpay marks it paid.
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const showQr = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'qr'
    setIsSaving(true)
    const response = await fetch(payment ? `/api/payments/${payment.id}` : '/api/payments', { method: payment ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, amount: Number(draft.amount), ...(showQr ? { status: 'pending' } : {}) }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { setError(response ? await readApiError(response, 'Payment could not be saved.') : 'Could not reach the server.'); return }
    onSaved(await response.json() as Payment, showQr)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="profile-modal payment-modal" onSubmit={save}>
        <div className="modal-heading"><div><p className="eyebrow">Payments</p><h2>{payment ? 'Edit payment' : 'Add payment'}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div className="payment-form-grid">
          <label className="payment-form-wide">Property<select required value={draft.propertyId} onChange={(event) => update({ propertyId: event.target.value, residentId: null, payerName: '', phone: '' })}><option value="" disabled>Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <label className="payment-form-wide">Resident<select value={draft.residentId ?? ''} disabled={!draft.propertyId} onChange={(event) => chooseResident(event.target.value)}><option value="">{draft.propertyId ? 'Someone else (enter below)' : 'Select a property first'}</option>{propertyResidents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name} · Room {resident.room}</option>)}</select></label>
          <label>Name<input required maxLength={100} value={draft.payerName} onChange={(event) => update({ payerName: event.target.value })} /></label>
          <label>Phone number<input type="tel" inputMode="numeric" placeholder="10-digit mobile" value={draft.phone} onChange={(event) => update({ phone: event.target.value })} /></label>
          <label>Type<select disabled={isQrPayment} value={draft.method} onChange={(event) => update({ method: event.target.value as PaymentMethod })}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Bank name<input maxLength={100} disabled={draft.method === 'cash'} placeholder={draft.method === 'cash' ? 'Not needed for cash' : 'e.g. HDFC Bank'} value={draft.method === 'cash' ? '' : draft.bankName} onChange={(event) => update({ bankName: event.target.value })} /></label>
          <label>Amount in rupees<input required disabled={isQrPayment} type="number" min="1" step="1" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} /></label>
          <label>Status<select disabled={isQrPayment} value={draft.status} onChange={(event) => update({ status: event.target.value as PaymentStatus })}>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button>{canShowQr && <button type="submit" value="qr" className="secondary-button" disabled={isSaving}><QrCode size={16} /> Save &amp; show UPI QR</button>}<button type="submit" className="primary-button" disabled={isSaving}><Plus size={16} /> {isSaving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>
  )
}
