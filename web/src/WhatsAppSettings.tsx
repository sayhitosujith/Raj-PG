import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Send, XCircle } from 'lucide-react'
import { WhatsAppIcon } from './WhatsAppIcon'
import { readApiError } from './superAdmin'

type Message = { id: string; residentName: string | null; to: string; template: string; status: 'pending' | 'sent' | 'failed'; error: string | null; createdAt: string }
type Status = { enabled: boolean; cronConfigured: boolean; language: string; templates: string[]; recent: Message[] }

const statusTone = { sent: 'sage', pending: 'gold', failed: 'coral' } as const

/**
 * WhatsApp setup and health: whether the server has its keys and cron secret, the template names
 * to create in Meta, a test message, a manual reminder run, and the latest messages with errors.
 */
export function WhatsAppSettings({ onNotice }: { onNotice: (message: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const load = useCallback(() => {
    fetch('/api/whatsapp/status').then((response) => response.ok ? response.json() as Promise<Status> : Promise.reject(new Error('status failed'))).then(setStatus, () => onNotice('WhatsApp status could not be loaded.'))
  }, [onNotice])
  useEffect(load, [load])

  async function post(path: string, body: unknown, success: (result: Record<string, unknown>) => string) {
    setIsBusy(true)
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setIsBusy(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'WhatsApp request failed.') : 'Could not reach the server.'); return }
    onNotice(success(await response.json() as Record<string, unknown>))
    load()
  }

  const runReminders = () => post('/api/whatsapp/run-rent-reminders', {}, (result) => typeof result.skipped === 'string' ? result.skipped : `Reminder run done: ${JSON.stringify(result.attempted)} (already-sent reminders are skipped).`)

  return (
    <section className="settings-section wide whatsapp-settings">
      <div className="settings-section-head"><span className="settings-section-icon whatsapp-green"><WhatsAppIcon size={18} /></span><div><h3>WhatsApp messages</h3><p>Rent reminders, payment receipts, announcements and housekeeping updates are sent to residents who have WhatsApp updates on.</p></div></div>
      {!status ? <p className="settings-hint">Loading…</p> : <>
        <ul className="whatsapp-checks">
          <li className={status.enabled ? 'is-ok' : 'is-missing'}>{status.enabled ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {status.enabled ? 'Connected to WhatsApp' : 'Not connected: add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server'}</li>
          <li className={status.cronConfigured ? 'is-ok' : 'is-missing'}>{status.cronConfigured ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {status.cronConfigured ? 'Daily reminder trigger is set up (CRON_SECRET)' : 'Daily reminders off: add CRON_SECRET on the server and a daily cron job'}</li>
        </ul>
        <p className="settings-hint">Create these message templates in WhatsApp Manager (category Utility, language <code>{status.language}</code>): {status.templates.map((name, index) => <span key={name}>{index ? ', ' : ''}<code>{name}</code></span>)}.</p>
        <div className="whatsapp-actions">
          <form onSubmit={(event) => { event.preventDefault(); void post('/api/whatsapp/test', { phone: testPhone }, () => 'Test message sent. Check WhatsApp on that phone.') }}>
            <input value={testPhone} onChange={(event) => setTestPhone(event.target.value)} inputMode="numeric" placeholder="Your 10-digit mobile" aria-label="Phone for a test message" />
            <button type="submit" className="secondary-button" disabled={isBusy || !status.enabled}><Send size={14} /> Send test</button>
          </form>
          <button type="button" className="secondary-button" disabled={isBusy || !status.enabled} onClick={runReminders}>Run rent reminders now</button>
        </div>
        {status.recent.length > 0 && (
          <div className="crud-list whatsapp-log">{status.recent.map((message) => (
            <div className="crud-row" key={message.id}>
              <div className="crud-main"><strong>{message.residentName ?? message.to} · <code>{message.template}</code></strong><small>{new Date(message.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{message.error ? ` · ${message.error}` : ''}</small></div>
              <span className={`status-pill ${statusTone[message.status]}`}>{message.status}</span>
            </div>
          ))}</div>
        )}
      </>}
    </section>
  )
}
