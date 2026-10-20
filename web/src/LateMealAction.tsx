import { useState } from 'react'
import { Hand } from 'lucide-react'
import type { ResidentMeal } from './food'
import { readApiError } from './superAdmin'

/**
 * For a meal the resident is not down for after its 9 pm cutoff: a "Request Meal" button, or the
 * request's state once sent: waiting, declined with the staff's note, or approved with who approved it
 * (the meal then shows as eating). Shared by the Home meal cards and the weekly menu.
 */
export function LateMealAction({ date, meal, onChanged, onNotice }: { date: string; meal: Pick<ResidentMeal, 'meal' | 'canRequestLate' | 'lateRequest'>; onChanged: () => void; onNotice: (message: string) => void }) {
  const [isSending, setIsSending] = useState(false)
  const request = meal.lateRequest

  async function send() {
    setIsSending(true)
    const response = await fetch('/api/resident-portal/food/late-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, meal: meal.meal }) }).catch(() => null)
    setIsSending(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Your request could not be sent.') : 'Could not reach the server.'); return }
    onNotice('Request sent. The reception will approve or decline it.')
    onChanged()
  }

  if (request?.status === 'PENDING') return <span className="late-meal-status is-pending">Requested · waiting for approval</span>
  if (request?.status === 'APPROVED') return <span className="late-meal-status is-approved">Approved{request.decidedByName ? ` by ${request.decidedByName}` : ''}</span>
  if (request?.status === 'DECLINED') return <span className="late-meal-status is-declined">Request declined{request.staffNote ? `: ${request.staffNote}` : ''}</span>
  if (!meal.canRequestLate) return null
  return <button type="button" className="secondary-button late-meal-button" disabled={isSending} onClick={() => void send()}><Hand size={13} /> {isSending ? 'Sending…' : 'Request Meal'}</button>
}
