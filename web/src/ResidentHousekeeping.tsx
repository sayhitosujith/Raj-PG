import { useEffect, useState } from 'react'
import { BellRing, CalendarPlus, Sparkles, X } from 'lucide-react'
import { describeVisit, formatTime, isOpenRequest, statusDetails, type HousekeepingRequest, type HousekeepingSlot } from './housekeeping'
import type { SlotOption } from './workspaceSettings'
import { todayDateInputValue } from './joinDate'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'

const maxDaysAhead = 60

async function fetchRequests() {
  const response = await fetch('/api/resident-portal/housekeeping')
  if (!response.ok) throw new Error('Housekeeping request failed')
  return await response.json() as HousekeepingRequest[]
}

// The server says from when a reminder is allowed (slot started, cooldown over). The current time
// is taken each time the list loads, and the one-minute auto refresh reloads it, so the button
// appears on time.
const canRemindNow = (request: HousekeepingRequest, now: number) => request.canRemindAt !== null && new Date(request.canRemindAt).getTime() <= now

function daysFromToday(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return todayDateInputValue(date)
}

/** Date + slot + note form; the server re-checks everything (date window, duplicates). */
function RequestForm({ slots, onCreated, onClose }: { slots: SlotOption[]; onCreated: (request: HousekeepingRequest) => void; onClose: () => void }) {
  const [slot, setSlot] = useState<HousekeepingSlot>('MORNING')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/resident-portal/housekeeping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: form.get('date'), slot, note: form.get('note') }) })
      if (!response.ok) { setError(await readApiError(response, 'Could not send your request.')); return }
      onCreated(await response.json() as HousekeepingRequest)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="profile-modal housekeeping-form" onSubmit={submit}>
        <div className="modal-heading"><div><p className="eyebrow">Housekeeping</p><h2>Request a cleaning</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <label>Date<input name="date" type="date" required defaultValue={todayDateInputValue()} min={todayDateInputValue()} max={daysFromToday(maxDaysAhead)} /></label>
        <fieldset className="slot-options">
          <legend>Time</legend>
          {slots.map((option) => <label key={option.value} className={`slot-option${slot === option.value ? ' is-selected' : ''}`}><input type="radio" name="slot" value={option.value} checked={slot === option.value} onChange={() => setSlot(option.value)} /><strong>{option.label}</strong><small>{option.hours}</small></label>)}
        </fieldset>
        <label>Note <span>(optional)</span><textarea name="note" maxLength={300} placeholder="e.g. Please also clean the bathroom" /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}><CalendarPlus size={16} /> {isSaving ? 'Sending…' : 'Request cleaning'}</button></div>
      </form>
    </div>
  )
}

/** The resident's housekeeping card: request a cleaning, follow its status, cancel if plans change. */
// While rent is overdue the server refuses new requests; the button says so instead of failing.
export function ResidentHousekeeping({ refreshSignal, isPaused, slots, onNotice }: { refreshSignal: number; isPaused: boolean; slots: SlotOption[]; onNotice: (message: string) => void }) {
  const [requests, setRequests] = useState<HousekeepingRequest[] | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [remindingId, setRemindingId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  function showRequests(list: HousekeepingRequest[]) {
    setRequests(list)
    setNow(Date.now())
  }

  useEffect(() => { fetchRequests().then(showRequests, () => setRequests([])) }, [])
  useRefreshSignal(refreshSignal, () => { fetchRequests().then(showRequests, () => undefined) })

  // updatedAt is stamped by the server on every change, so it doubles as "now" after an action.
  function replaceRequest(updated: HousekeepingRequest) {
    setRequests((current) => current?.map((item) => item.id === updated.id ? updated : item) ?? [updated])
    setNow(Date.parse(updated.updatedAt))
  }

  async function remind(request: HousekeepingRequest) {
    setRemindingId(request.id)
    const response = await fetch(`/api/resident-portal/housekeeping/${request.id}/remind`, { method: 'POST' }).catch(() => null)
    setRemindingId(null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Could not send the reminder.') : 'Could not reach the server.'); return }
    replaceRequest(await response.json() as HousekeepingRequest)
    onNotice('Reminder sent to your property owner.')
  }

  async function cancel(request: HousekeepingRequest) {
    if (!window.confirm(`Cancel your housekeeping request for ${describeVisit(request)}?`)) return
    setCancellingId(request.id)
    const response = await fetch(`/api/resident-portal/housekeeping/${request.id}/cancel`, { method: 'POST' }).catch(() => null)
    setCancellingId(null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Could not cancel the request.') : 'Could not reach the server.'); return }
    replaceRequest(await response.json() as HousekeepingRequest)
    onNotice('Housekeeping request cancelled.')
  }

  return (
    <section className="workspace-view housekeeping-card">
      <div className="workspace-view-heading"><div><p className="eyebrow">Service</p><h2>Housekeeping</h2><p>Request a room cleaning at a time that suits you.</p></div><div className="view-actions"><button className="primary-button" disabled={isPaused} title={isPaused ? 'Paused until your overdue rent is paid' : undefined} onClick={() => setIsRequesting(true)}><Sparkles size={16} /> Request housekeeping</button>{isPaused && <small className="paused-note">Paused until overdue rent is paid</small>}</div></div>
      {requests === null
        ? <p className="portal-empty">Loading…</p>
        : requests.length
          ? <div className="crud-list">{requests.map((request) => <div className="crud-row housekeeping-row" key={request.id}>
              <div className="crud-main"><strong>{describeVisit(request)}</strong>{request.note && <small>Your note: {request.note}</small>}{request.ownerNote && <small className="owner-note">From your property owner: {request.ownerNote}</small>}{isOpenRequest(request) && request.lastReminderAt && <small className="reminder-note"><BellRing size={11} /> Reminder sent at {formatTime(request.lastReminderAt)}{request.canRemindAt && new Date(request.canRemindAt).getTime() > now ? ` · you can send another after ${formatTime(request.canRemindAt)}` : ''}</small>}{request.isOverdue && !request.lastReminderAt && <small className="reminder-note">Your time slot has ended. If no one came, send a reminder.</small>}</div>
              <div className="crud-actions"><span className={`status-pill ${statusDetails[request.status].tone}`}>{statusDetails[request.status].label}</span>{canRemindNow(request, now) && <button className="secondary-button remind-button" disabled={remindingId === request.id} onClick={() => remind(request)}><BellRing size={13} /> {remindingId === request.id ? 'Sending…' : 'Not here yet? Remind'}</button>}{isOpenRequest(request) && <button className="secondary-button" disabled={cancellingId === request.id} onClick={() => cancel(request)}>{cancellingId === request.id ? 'Cancelling…' : 'Cancel'}</button>}</div>
            </div>)}</div>
          : <div className="workspace-empty"><div className="workspace-empty-icon"><Sparkles size={20} /></div><h3>No requests yet</h3><p>Tap “Request housekeeping” to book a cleaning.</p></div>}
      {isRequesting && <RequestForm slots={slots} onClose={() => setIsRequesting(false)} onCreated={(created) => { setRequests((current) => [created, ...(current ?? [])]); setIsRequesting(false); onNotice(`Housekeeping requested for ${describeVisit(created)}.`) }} />}
    </section>
  )
}
