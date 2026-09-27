import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { formatRupees } from './rent'

/** A QR code's state as the server reports it; status comes from Razorpay, never the browser. */
export type QrState = { status: string; amount: number; imageUrl: string | null; expiresAt: string | null }

const pollEveryMs = 4000

function minutesLeft(expiresAt: string | null, now: number) {
  if (!expiresAt) return null
  const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Shows a Razorpay UPI QR and polls `poll` until the server reports it paid or failed. Shared by
 * the owner's Payments screen and the resident portal, which differ only in their endpoints.
 * Remount it (via `key`) for a new code; `initial` is only read on mount.
 */
export function UpiQrPanel({ initial, poll, onSettled, onRetry }: { initial: QrState; poll: () => Promise<QrState>; onSettled: (state: QrState) => void; onRetry: () => void }) {
  const [state, setState] = useState(initial)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (state.status !== 'pending') return
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(clock)
  }, [state.status])

  useEffect(() => {
    if (state.status !== 'pending') return
    const timer = window.setInterval(() => {
      poll().then((next) => {
        setState(next)
        if (next.status !== 'pending') onSettled(next)
      }).catch(() => undefined)
    }, pollEveryMs)
    return () => window.clearInterval(timer)
  }, [state.status, poll, onSettled])

  if (state.status === 'paid') return <div className="upi-qr-panel is-paid"><CheckCircle2 size={44} /><strong>{formatRupees(state.amount)} received</strong><p>The payment is confirmed and recorded.</p></div>
  if (state.status !== 'pending') return <div className="upi-qr-panel"><Clock size={36} /><strong>This QR code expired unpaid</strong><p>No money was taken. Generate a new code to try again.</p><button type="button" className="primary-button" onClick={onRetry}><RefreshCw size={15} /> New QR code</button></div>
  return (
    <div className="upi-qr-panel">
      {state.imageUrl && <img className="upi-qr-image" src={state.imageUrl} alt={`UPI QR code for ${formatRupees(state.amount)}`} />}
      <strong>Scan to pay {formatRupees(state.amount)}</strong>
      <p>Open any UPI app (GPay, PhonePe, Paytm, BHIM) and scan. This updates by itself once paid.</p>
      <small className="upi-qr-waiting"><span className="upi-qr-dot" /> Waiting for payment{minutesLeft(state.expiresAt, now) ? ` · expires in ${minutesLeft(state.expiresAt, now)}` : ''}</small>
    </div>
  )
}
