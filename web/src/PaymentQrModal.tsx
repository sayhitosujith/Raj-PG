import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Payment } from './payment'
import { readApiError } from './superAdmin'
import { UpiQrPanel, type QrState } from './UpiQrPanel'
import { ModalLayer } from './ModalLayer'

const toQrState = (payment: Payment): QrState => ({ status: payment.status, amount: payment.amount, imageUrl: payment.qrImageUrl, expiresAt: payment.qrExpiresAt })

async function requestQr(paymentId: string, method: 'POST' | 'GET') {
  const response = await fetch(`/api/payments/${paymentId}/upi-qr`, { method })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not load the UPI QR code.'))
  return await response.json() as Payment
}

/** The owner's "show this QR to the payer" screen; every status change is passed to `onUpdated`. */
export function PaymentQrModal({ payment, onClose, onUpdated }: { payment: Payment; onClose: () => void; onUpdated: (payment: Payment) => void }) {
  const [qr, setQr] = useState<QrState | null>(null)
  const [error, setError] = useState('')

  const start = useCallback(() => {
    requestQr(payment.id, 'POST').then((updated) => { onUpdated(updated); setError(''); setQr(toQrState(updated)) }, (failure: Error) => setError(failure.message))
  }, [payment.id, onUpdated])
  const retry = () => { setQr(null); start() }
  useEffect(start, [start])

  const poll = useCallback(async () => {
    const updated = await requestQr(payment.id, 'GET')
    onUpdated(updated)
    return toQrState(updated)
  }, [payment.id, onUpdated])

  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="profile-modal payment-modal" role="dialog" aria-label="UPI QR payment">
        <div className="modal-heading"><div><p className="eyebrow">UPI QR · {payment.payerName}</p><h2>Collect payment</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        {error ? <p className="login-error" role="alert">{error}</p> : qr ? <UpiQrPanel initial={qr} poll={poll} key={qr.imageUrl} onSettled={setQr} onRetry={retry} /> : <p className="upi-qr-loading">Creating QR code…</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{qr?.status === 'paid' ? 'Done' : 'Close'}</button></div>
      </div>
    </div></ModalLayer>
  )
}
