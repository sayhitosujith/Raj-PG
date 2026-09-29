import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Mail, Send, TriangleAlert, XCircle } from 'lucide-react'
import { readApiError } from './superAdmin'

type Message = { id: string; residentName: string | null; to: string; kind: string; status: 'pending' | 'sent' | 'failed'; error: string | null; createdAt: string }
type Status = { enabled: boolean; from: string; usingTestSender: boolean; alertsTo: string[]; recent: Message[] }

const statusTone = { sent: 'sage', pending: 'gold', failed: 'coral' } as const
const kindLabels: Record<string, string> = { payment_received: 'Payment receipt', rent_reminder: 'Rent reminder', rent_overdue: 'Overdue notice', announcement: 'Announcement', booking_alert: 'Booking alert' }

/**
 * Email setup and health: whether the server has its Resend key, who emails come from (and a
 * warning while that is Resend's test sender), who gets booking alerts (every super admin), a test
 * email, and the latest emails with any errors.
 */
export function EmailSettings({ onNotice }: { onNotice: (message: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [testTo, setTestTo] = useState('')
  const [isSending, setIsSending] = useState(false)

  const load = useCallback(() => {
    fetch('/api/email/status').then((response) => response.ok ? response.json() as Promise<Status> : Promise.reject(new Error('status failed'))).then(setStatus, () => onNotice('Email status could not be loaded.'))
  }, [onNotice])
  useEffect(load, [load])

  async function sendTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSending(true)
    const response = await fetch('/api/email/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: testTo }) }).catch(() => null)
    setIsSending(false)
    onNotice(response?.ok ? `Test email sent to ${testTo}.` : response ? await readApiError(response, 'The test email failed.') : 'Could not reach the server.')
  }

  return (
    <section className="settings-section wide whatsapp-settings">
      <div className="settings-section-head"><span className="settings-section-icon"><Mail size={18} /></span><div><h3>Email</h3><p>Payment receipts, rent reminders and notices to residents, and an alert to you for each new booking request.</p></div></div>
      {!status ? <p className="settings-hint">Loading…</p> : <>
        <ul className="whatsapp-checks">
          <li className={status.enabled ? 'is-ok' : 'is-missing'}>{status.enabled ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {status.enabled ? <>Connected to Resend · sending as <code>{status.from}</code></> : 'Not connected: add RESEND_API_KEY on the server'}</li>
          {status.enabled && status.usingTestSender && <li className="is-warning"><TriangleAlert size={15} /> Using Resend&apos;s test sender, which only delivers to your Resend account&apos;s address. Verify your domain in Resend and set EMAIL_FROM to email residents.</li>}
          <li className={status.alertsTo.length ? 'is-ok' : 'is-missing'}>{status.alertsTo.length ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {status.alertsTo.length ? <>Booking alerts go to every super admin: {status.alertsTo.map((address, index) => <span key={address}>{index ? ', ' : ''}<code>{address}</code></span>)}</> : 'Booking alerts off: no super admin or contact email has an email address'}</li>
        </ul>
        <div className="whatsapp-actions">
          <form onSubmit={sendTest}>
            <input value={testTo} onChange={(event) => setTestTo(event.target.value)} type="email" placeholder="you@example.com" aria-label="Email address for a test" />
            <button type="submit" className="secondary-button" disabled={isSending || !status.enabled}><Send size={14} /> Send test</button>
          </form>
        </div>
        {status.recent.length > 0 && (
          <div className="crud-list whatsapp-log">{status.recent.map((message) => (
            <div className="crud-row" key={message.id}>
              <div className="crud-main"><strong>{message.residentName ?? message.to} · {kindLabels[message.kind] ?? message.kind}</strong><small>{new Date(message.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {message.to}{message.error ? ` · ${message.error}` : ''}</small></div>
              <span className={`status-pill ${statusTone[message.status]}`}>{message.status}</span>
            </div>
          ))}</div>
        )}
      </>}
    </section>
  )
}
