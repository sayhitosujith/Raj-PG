import { useCallback, useEffect, useState } from 'react'
import { CalendarPlus, History, Trash2, X, XCircle } from 'lucide-react'
import { ModalLayer } from './ModalLayer'
import { formatRupees } from './rent'
import { readApiError } from './superAdmin'
import { addDays, fetchSubscriptions, formatDay, indiaToday, periodText, planEndsOn, planLengths, statusBadge, type ReceptionistSubscriptions, type Subscription } from './subscriptions'
import { useRefreshSignal } from './useAutoRefresh'

const planNames = Object.keys(planLengths)

/**
 * Add / renew form. A renewal starts the day after the current period ends, so time is never lost or
 * doubled; a lapsed or new subscription starts today. Picking a plan fills the end date, which stays
 * editable; Custom leaves it to the owner.
 */
function RenewModal({ receptionist, onClose, onSaved }: { receptionist: ReceptionistSubscriptions; onClose: () => void; onSaved: (message: string) => void }) {
  const today = indiaToday()
  const current = receptionist.history[0]
  // Renewing follows the last day the current period actually gives, so time after End now is not skipped.
  const isRenewal = Boolean(current && current.lastDay >= today)
  const [plan, setPlan] = useState(current?.plan && current.plan in planLengths ? current.plan : 'Monthly')
  const firstDay = isRenewal ? addDays(current!.lastDay, 1) : today
  const [startsOn, setStartsOn] = useState(firstDay)
  const [endsOn, setEndsOn] = useState(() => planEndsOn(firstDay, planLengths[plan]?.months ?? 1))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Keeps the end date in step with the plan and start date, except for Custom, which the owner sets.
  function choose(nextPlan: string, nextStart: string) {
    setPlan(nextPlan)
    setStartsOn(nextStart)
    const length = planLengths[nextPlan]
    if (length && nextStart) setEndsOn(planEndsOn(nextStart, length.months))
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsSaving(true)
    setError('')
    const response = await fetch('/api/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId: receptionist.id, plan, startsOn, endsOn, amount: Number(form.get('amount')), note: String(form.get('note') ?? '') }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { setError(response ? await readApiError(response, 'The subscription could not be saved.') : 'Could not reach the server.'); return }
    onSaved(`${receptionist.name}'s ${plan.toLowerCase()} subscription runs to ${formatDay(endsOn)}.`)
  }

  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="profile-modal" onSubmit={save} aria-labelledby="renew-title">
        <div className="modal-heading"><div><p className="eyebrow">{receptionist.name}</p><h2 id="renew-title">{isRenewal ? 'Renew subscription' : 'Add subscription'}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        {isRenewal && <p className="field-hint">The current period runs to {formatDay(current!.lastDay)}; this one starts the day after.</p>}
        <label>Plan<select value={plan} onChange={(event) => choose(event.target.value, startsOn)}>{planNames.map((name) => <option key={name}>{name}</option>)}</select></label>
        <div className="subscription-dates">
          <label>Starts on<input type="date" required value={startsOn} onChange={(event) => choose(plan, event.target.value)} /></label>
          <label>Ends on <span className="field-hint">(last day included)</span><input type="date" required min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
        </div>
        <label>Amount paid (₹)<input name="amount" type="number" inputMode="numeric" min={0} max={10000000} step={1} required placeholder="e.g. 1500" /></label>
        <label>Note <span className="field-hint">(optional)</span><input name="note" maxLength={300} placeholder="e.g. Paid by UPI" /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}><CalendarPlus size={16} /> {isSaving ? 'Saving…' : isRenewal ? 'Renew' : 'Add subscription'}</button></div>
      </form>
    </div></ModalLayer>
  )
}

/** A yes/no step before ending access or deleting a period, both of which act at once. */
function Confirm({ title, detail, action, onConfirm, onCancel }: { title: string; detail: string; action: string; onConfirm: () => Promise<string | null>; onCancel: () => void }) {
  const [error, setError] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  async function confirm() {
    setIsWorking(true)
    const failure = await onConfirm()
    setIsWorking(false)
    if (failure) setError(failure)
  }
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="confirm-modal" role="alertdialog" aria-labelledby="subscription-confirm-title"><div className="confirm-icon"><XCircle size={22} /></div><h2 id="subscription-confirm-title">{title}</h2><p>{detail}</p>{error && <p className="login-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="button" className="danger-button" disabled={isWorking} onClick={() => void confirm()}>{isWorking ? 'Working…' : action}</button></div></div>
    </div></ModalLayer>
  )
}

function HistoryList({ history, onDelete }: { history: Subscription[]; onDelete: (subscription: Subscription) => void }) {
  if (!history.length) return <p className="field-hint subscription-empty">No subscriptions recorded yet.</p>
  return (
    <ul className="subscription-history">{history.map((row) => (
      <li key={row.id}>
        <div><strong>{row.plan}</strong><small>{periodText(row)}{row.note ? ` · ${row.note}` : ''}</small></div>
        <span className="subscription-amount">{formatRupees(row.amount)}</span>
        <button className="row-delete" aria-label={`Delete the ${row.plan} period ending ${formatDay(row.endsOn)}`} title="Delete this record" onClick={() => onDelete(row)}><Trash2 size={14} /></button>
      </li>
    ))}</ul>
  )
}

/**
 * Owner page: every receptionist with where their subscription stands, to add or renew a period, end
 * access now, or remove a period entered by mistake. Receptionists with none set are not restricted.
 */
export function SubscriptionsView({ properties, refreshSignal, onBack, onNotice }: { properties: Array<{ id?: string; name: string }>; refreshSignal: number; onBack: () => void; onNotice: (message: string) => void }) {
  const [rows, setRows] = useState<ReceptionistSubscriptions[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [renewing, setRenewing] = useState<ReceptionistSubscriptions | null>(null)
  const [ending, setEnding] = useState<ReceptionistSubscriptions | null>(null)
  const [deleting, setDeleting] = useState<{ receptionist: ReceptionistSubscriptions; subscription: Subscription } | null>(null)
  const [openHistory, setOpenHistory] = useState<string | null>(null)

  const load = useCallback(() => fetchSubscriptions().then((next) => { setRows(next); setLoadError('') }, (error: Error) => setLoadError(error.message)), [])
  useEffect(() => { void load() }, [load])
  useRefreshSignal(refreshSignal, () => { void load() })

  const propertyNames = (ids: string[]) => properties.filter((property) => property.id && ids.includes(property.id)).map((property) => property.name).join(', ')

  async function endNow() {
    if (!ending) return null
    const response = await fetch(`/api/subscriptions/staff/${ending.id}/end`, { method: 'POST' }).catch(() => null)
    if (!response?.ok) return response ? readApiError(response, 'The subscription could not be ended.') : 'Could not reach the server.'
    onNotice(`${ending.name}'s subscription has ended. They can no longer use the dashboard.`)
    setEnding(null)
    await load()
    return null
  }

  async function deleteRecord() {
    if (!deleting) return null
    const response = await fetch(`/api/subscriptions/${deleting.subscription.id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) return response ? readApiError(response, 'The record could not be deleted.') : 'Could not reach the server.'
    onNotice('Subscription record deleted.')
    setDeleting(null)
    await load()
    return null
  }

  return (
    <section className="workspace-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Subscriptions</h2><p>Each receptionist can sign in until their subscription ends. Add or renew it here; a receptionist with none set is not restricted.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div></div>
      {loadError && <p className="login-error" role="alert">{loadError} <button className="text-button" onClick={() => void load()}>Retry</button></p>}
      {rows && !rows.length && <p className="portal-empty">No receptionists yet. Add one under Team, then set their subscription here.</p>}
      <div className="crud-list">{rows?.map((receptionist, index) => {
        const badge = statusBadge(receptionist.status)
        const current = receptionist.history[0]
        const isRunning = receptionist.status.state === 'ACTIVE' || receptionist.status.state === 'ENDING_SOON'
        return (
          <div className="crud-row subscription-row" key={receptionist.id}>
            <span className="row-number" aria-hidden="true">{index + 1}</span>
            <div className="crud-main">
              <strong>{receptionist.name}</strong>
              <small title={propertyNames(receptionist.propertyIds)}>{receptionist.email}</small>
              <small>{current ? `${current.plan} · ${periodText(current)} · ${formatRupees(current.amount)}` : 'No subscription recorded'}</small>
            </div>
            <div className="crud-actions">
              <span className={`status-pill ${badge.tone}`}>{badge.label}</span>
              <button className="secondary-button" onClick={() => setRenewing(receptionist)}><CalendarPlus size={13} /> {isRunning ? 'Renew' : 'Add'}</button>
              <button className="secondary-button" aria-expanded={openHistory === receptionist.id} onClick={() => setOpenHistory((open) => open === receptionist.id ? null : receptionist.id)}><History size={13} /> History ({receptionist.history.length})</button>
              {isRunning && <button className="secondary-button subscription-end" onClick={() => setEnding(receptionist)}><XCircle size={13} /> End now</button>}
            </div>
            {openHistory === receptionist.id && <HistoryList history={receptionist.history} onDelete={(subscription) => setDeleting({ receptionist, subscription })} />}
          </div>
        )
      })}</div>
      {renewing && <RenewModal receptionist={renewing} onClose={() => setRenewing(null)} onSaved={(message) => { setRenewing(null); onNotice(message); void load() }} />}
      {ending && <Confirm title={`End ${ending.name}'s subscription now?`} detail="They lose access at once and cannot sign in until you add a new period. Their history is kept." action="End now" onConfirm={endNow} onCancel={() => setEnding(null)} />}
      {deleting && <Confirm title="Delete this record?" detail={`${deleting.subscription.plan}, ${periodText(deleting.subscription)}, ${formatRupees(deleting.subscription.amount)}. Use this for a period entered by mistake; ${deleting.receptionist.name}'s status then follows the periods that remain.`} action="Delete" onConfirm={deleteRecord} onCancel={() => setDeleting(null)} />}
    </section>
  )
}
