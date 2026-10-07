import { useCallback, useState } from 'react'
import { QrCode, X } from 'lucide-react'
import { readApiError } from './superAdmin'
import { UpiQrPanel, type QrState } from './UpiQrPanel'
import { ModalLayer } from './ModalLayer'

type QrView = QrState & { paymentId: string }

async function readQr(response: Response) {
  if (!response.ok) throw new Error(await readApiError(response, 'Could not load the UPI QR code.'))
  return await response.json() as QrView
}

/**
 * "Pay by UPI QR" for everything the resident owes. The server snapshots the amount and creates a
 * Razorpay code; once paid, the months are recorded and the owner's Payments list shows it.
 */
export function UpiQrRentButton({ onPaid, onNotice }: { onPaid: () => Promise<void>; onNotice: (message: string) => void }) {
  const [qr, setQr] = useState<QrView | null>(null)
  const [isOpening, setIsOpening] = useState(false)

  const open = useCallback(async () => {
    setIsOpening(true)
    try { setQr(await readQr(await fetch('/api/resident-portal/rent/upi-qr', { method: 'POST' }))) } catch (error) { onNotice((error as Error).message) } finally { setIsOpening(false) }
  }, [onNotice])

  const paymentId = qr?.paymentId
  const poll = useCallback(async () => readQr(await fetch(`/api/resident-portal/rent/upi-qr/${paymentId}`)), [paymentId])
  const settled = useCallback((state: QrState) => {
    if (state.status !== 'paid') return
    onNotice('Payment received. Thank you!')
    void onPaid()
  }, [onNotice, onPaid])

  return (
    <>
      <button type="button" className="secondary-button pay-rent-button" disabled={isOpening} onClick={open}><QrCode size={15} /> {isOpening ? 'Creating QR…' : 'Pay by UPI QR'}</button>
      {qr && (
        <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setQr(null)}>
          <div className="profile-modal payment-modal" role="dialog" aria-label="Pay rent by UPI QR">
            <div className="modal-heading"><div><p className="eyebrow">Rent</p><h2>Pay by UPI QR</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setQr(null)}><X size={18} /></button></div>
            <UpiQrPanel key={qr.imageUrl} initial={qr} poll={poll} onSettled={settled} onRetry={open} />
          </div>
        </div></ModalLayer>
      )}
    </>
  )
}
