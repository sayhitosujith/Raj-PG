import { useCallback, useEffect, useState } from 'react'
import { Check, Hand, X } from 'lucide-react'
import { displayName } from './displayName'
import { formatShortDate, type LateMealRequest } from './food'
import { mealDetails } from './meals'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'

const mealLabel = (meal: LateMealRequest['meal']) => mealDetails.find((detail) => detail.meal === meal)!.label
const statusText: Record<LateMealRequest['status'], string> = { PENDING: 'Waiting', APPROVED: 'Approved', DECLINED: 'Declined' }

function PendingRow({ request, onDecide }: { request: LateMealRequest; onDecide: (approve: boolean, note: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const decide = (approve: boolean) => { setIsSaving(true); void onDecide(approve, note).finally(() => setIsSaving(false)) }
  return (
    <li className="late-meal-row">
      <div className="late-meal-who"><strong>{displayName(request.residentName)}{request.room ? ` · Room ${request.room}` : ''}</strong><small>{mealLabel(request.meal)} · {formatShortDate(request.date)}</small></div>
      <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="Note to the resident (optional)" aria-label={`Note to ${request.residentName}`} />
      <div className="late-meal-actions">
        <button type="button" className="primary-button" disabled={isSaving} onClick={() => decide(true)}><Check size={14} /> Approve</button>
        <button type="button" className="secondary-button" disabled={isSaving} onClick={() => decide(false)}><X size={14} /> Decline</button>
      </div>
    </li>
  )
}

/**
 * A decided request, with the opposite decision one click away in case staff change their mind; the
 * server refuses the change once the meal has started.
 */
function DecidedRow({ request, onDecide }: { request: LateMealRequest; onDecide: (approve: boolean) => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false)
  const approve = request.status === 'DECLINED'
  return (
    <li>
      <span className={`late-meal-status is-${request.status.toLowerCase()}`}>{statusText[request.status]}</span>
      {displayName(request.residentName)} · {mealLabel(request.meal)} · {formatShortDate(request.date)}{request.decidedByName ? ` · by ${request.decidedByName}` : ''}{request.staffNote ? ` · “${request.staffNote}”` : ''}
      <button type="button" className="secondary-button late-meal-reapprove" disabled={isSaving} onClick={() => { setIsSaving(true); void onDecide(approve).finally(() => setIsSaving(false)) }}>{approve ? <Check size={13} /> : <X size={13} />} {isSaving ? 'Saving…' : approve ? 'Approve' : 'Decline'}</button>
    </li>
  )
}

/**
 * Late meal requests for one property: residents asking for a meal after its 9 pm cutoff. Reception or a
 * super admin approves (they are then counted in the headcount) or declines, with an optional note the
 * resident sees. Decided ones for today onwards stay listed below and can be switched until the meal
 * starts; any decision can move the headcount, so `onDecided` reloads it after each one.
 */
export function LateMealRequestsPanel({ propertyId, refreshSignal, onDecided, onNotice }: { propertyId: string; refreshSignal: number; onDecided: () => void; onNotice: (message: string) => void }) {
  const [requests, setRequests] = useState<LateMealRequest[] | null>(null)
  const [hasError, setHasError] = useState(false)

  const load = useCallback(() => fetch(`/api/properties/${propertyId}/late-meal-requests`)
    .then((response) => response.ok ? response.json() as Promise<LateMealRequest[]> : Promise.reject(new Error('load failed')))
    .then((list) => { setRequests(list); setHasError(false) }, () => setHasError(true)), [propertyId])
  useEffect(() => { setRequests(null); void load() }, [load])
  useRefreshSignal(refreshSignal, () => { void load() })

  async function decide(request: LateMealRequest, approve: boolean, note: string) {
    const response = await fetch(`/api/properties/${propertyId}/late-meal-requests/${request.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve, note }) }).catch(() => null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'The decision could not be saved.') : 'Could not reach the server.'); void load(); return }
    onNotice(`${approve ? 'Approved' : 'Declined'} ${displayName(request.residentName)}'s ${mealLabel(request.meal).toLowerCase()}.`)
    void load()
    onDecided()
  }

  const pending = requests?.filter((request) => request.status === 'PENDING') ?? []
  const decided = requests?.filter((request) => request.status !== 'PENDING') ?? []
  return (
    <div className="settings-section wide">
      <div className="settings-section-head"><span className="settings-section-icon"><Hand size={18} /></span><div><h3>Late meal requests</h3><p>{hasError && !requests ? 'Could not load late requests; it will retry on the next refresh.' : !requests ? 'Loading…' : pending.length ? `${pending.length} waiting. Residents asked for these after the 9 pm cutoff; approving counts them in the headcount.` : 'None waiting. Residents can ask for a meal after the 9 pm cutoff, until it starts.'}</p></div></div>
      {pending.length > 0 && <ul className="late-meal-list">{pending.map((request) => <PendingRow key={request.id} request={request} onDecide={(approve, note) => decide(request, approve, note)} />)}</ul>}
      {decided.length > 0 && <ul className="late-meal-decided">{decided.map((request) => <DecidedRow key={request.id} request={request} onDecide={(approve) => decide(request, approve, '')} />)}</ul>}
    </div>
  )
}
