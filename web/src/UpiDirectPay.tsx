import { useEffect, useState } from 'react'
import { Copy, Smartphone } from 'lucide-react'
import { siPaytm, siPhonepe, type SimpleIcon } from 'simple-icons'
import credIcon from './assets/upi/cred.png'
import googlePayMark from './assets/upi/google-pay.svg'
import superMoneyIcon from './assets/upi/super-money.png'
import { formatMonth, formatRupees, nextMonthToRecord, rentForMonth, type RentSummary } from './rent'
import { readApiError } from './superAdmin'
import type { UpiPayee } from './workspaceSettings'

// The best-known UPI apps, so residents recognise theirs at a glance. Google Pay's current mark is cropped from the
// logo on Google's own Pay site (simple-icons only has the old flat wordmark); PhonePe and Paytm come from
// simple-icons; super.money and CRED are the app icons they publish on their own sites. The QR works in any UPI app.
const upiAppMarks = [{ name: 'Google Pay', src: googlePayMark }]
const upiApps: SimpleIcon[] = [siPhonepe, siPaytm]
const upiAppIcons = [{ name: 'super.money', src: superMoneyIcon }, { name: 'CRED', src: credIcon }]

/** A payment the resident reported that the owner has not confirmed yet. */
export type UpiClaim = { amount: number; reference: string; rentMonths: Array<{ month: string; amount: number }> | null; createdAt: string }

/**
 * The standard UPI payment link (NPCI "upi://pay"), which every UPI app understands both as a
 * tapped link and as a scanned QR. Without an amount the payer's app asks for one. Encoded by
 * hand: URLSearchParams writes spaces as "+", which some UPI apps show literally in the payee name.
 */
function upiPayLink(payee: UpiPayee & { id: string }, amount: number | null, note: string) {
  const params = { pa: payee.id, pn: payee.payeeName, ...(amount ? { am: amount.toFixed(2) } : {}), cu: 'INR', tn: note }
  return `upi://pay?${Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`
}

// Loaded on first use so residents who never see this panel never download the QR encoder.
async function qrDataUrl(text: string) {
  const { toDataURL } = await import('qrcode')
  return toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
}

/**
 * What to tell the payer. A generated QR carries the amount; the owner's uploaded one usually does
 * not, so they must type it (and a known amount is spelled out so they type the right one).
 */
function scanHint(amount: number | null, payeeName: string, isUploadedQr: boolean) {
  if (!amount) return `Scan the QR with any UPI app and enter the amount you are paying to ${payeeName}.`
  return isUploadedQr ? `Scan the QR with any UPI app and enter ${formatRupees(amount)} for ${payeeName}.` : `to ${payeeName}. Scan the QR with any UPI app.`
}

/**
 * What the panel asks for, matching what the server will record (rentItemsToPay): everything
 * owed; else next month in advance; else, with no rent set up, whatever amount the resident sends.
 */
function payTarget(rent: RentSummary, monthlyRent: number | null) {
  if (rent.outstandingMonths.length) return { amount: rent.amountDue, caption: 'Rent due · pay by UPI' }
  if (rent.state !== 'NOT_TRACKED' && monthlyRent) return { amount: rentForMonth(rent, nextMonthToRecord(rent)), caption: `Next rent · ${formatMonth(nextMonthToRecord(rent))} · pay in advance` }
  return { amount: null, caption: 'Pay by UPI' }
}

/**
 * Pay rent straight to the owner's UPI ID: a QR and a tap-to-pay link (for the exact amount when
 * it is known), then "I've paid" (optionally with the UPI reference) so the owner can match it
 * in their bank app and confirm.
 */
export function UpiDirectPay({ payee, rent, monthlyRent, pendingClaim, onReported, onNotice }: { payee: UpiPayee; rent: RentSummary; monthlyRent: number | null; pendingClaim: UpiClaim | null; onReported: () => Promise<void>; onNotice: (message: string) => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const { amount, caption } = payTarget(rent, monthlyRent)
  const link = payee.id ? upiPayLink({ ...payee, id: payee.id }, amount, 'Rent') : null
  // The owner's uploaded QR wins; otherwise one is drawn from the UPI link (with the amount in it).
  const uploadedQr = payee.qrVersion ? `/api/resident-portal/upi-qr?v=${payee.qrVersion}` : null
  const qrSrc = uploadedQr ?? qr

  useEffect(() => {
    let isCurrent = true
    if (link && !uploadedQr) qrDataUrl(link).then((url) => { if (isCurrent) setQr(url) }, () => undefined)
    return () => { isCurrent = false }
  }, [link, uploadedQr])

  async function copyId() {
    if (!payee.id) return
    try { await navigator.clipboard.writeText(payee.id); onNotice('UPI ID copied.') } catch { onNotice(`UPI ID: ${payee.id}`) }
  }

  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSending(true)
    // The server ignores `amount` when it knows what is owed; it is only for the no-rent case.
    const response = await fetch('/api/resident-portal/rent/upi-claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, ...(amount ? {} : { amount: Number(paidAmount) }) }) }).catch(() => null)
    setIsSending(false)
    if (!response?.ok) { setError(response ? await readApiError(response, 'Your payment could not be reported.') : 'Could not reach the server.'); return }
    setError('')
    onNotice('Thanks! Your property owner will confirm the payment.')
    await onReported()
  }

  // A reported payment shows as "Pending approval" in the payments list (ResidentRentPayments); the
  // pay panel stays hidden meanwhile so the resident does not pay the same rent twice.
  if (pendingClaim) return null

  return (
    <div className="upi-direct">
      <div className="upi-direct-qr">{qrSrc ? <img className={uploadedQr ? 'is-uploaded' : undefined} src={qrSrc} alt={`UPI QR code to pay ${amount ? `${formatRupees(amount)} ` : ''}to ${payee.payeeName}`} /> : <span className="upi-direct-qr-placeholder" />}</div>
      <div className="upi-direct-body">
        <p className="eyebrow">{caption}</p>
        {amount ? <strong className="upi-direct-amount">{formatRupees(amount)}</strong> : <strong className="upi-direct-amount">{payee.payeeName}</strong>}
        <ul className="upi-apps" aria-label="Accepted UPI apps">{upiAppMarks.map((app) => <li key={app.name} title={app.name} className="is-mark"><img src={app.src} alt={app.name} /></li>)}{upiApps.map((app) => <li key={app.slug} title={app.title} className={`is-${app.slug}`}><svg viewBox="0 0 24 24" role="img" aria-label={app.title} fill={`#${app.hex}`}><path d={app.path} /></svg></li>)}{upiAppIcons.map((app) => <li key={app.name} title={app.name} className="is-image"><img src={app.src} alt={app.name} /></li>)}<li className="is-any">+ any UPI app</li></ul>
        <p>{scanHint(amount, payee.payeeName, Boolean(uploadedQr))}{payee.id ? ' Or pay to this UPI ID:' : ''}</p>
        {payee.id && <><div className="upi-direct-id"><code>{payee.id}</code><button type="button" className="icon-button" aria-label="Copy UPI ID" title="Copy UPI ID" onClick={copyId}><Copy size={15} /></button></div>
        <a className="secondary-button upi-direct-open" href={link ?? undefined}><Smartphone size={15} /> Open UPI app</a></>}
        <form className="upi-direct-report" onSubmit={report}>
          {!amount && <label className="upi-direct-amount-field">Amount paid (₹)<input value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} type="number" min={1} step={1} inputMode="numeric" required /></label>}
          <label>Paid already? UPI reference (UTR) <span>(optional, helps your owner find it)</span><input value={reference} onChange={(event) => setReference(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="12 digits, e.g. 412345678901" /></label>
          <button type="submit" className="primary-button" disabled={isSending}>{isSending ? 'Sending…' : "I've paid"}</button>
        </form>
        {error && <p className="login-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
