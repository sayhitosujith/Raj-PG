import { useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { formatRupees } from './rent'
import { readApiError } from './superAdmin'

const formatDay = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * For residents without food: asks the owner to add them to the food plan. The owner approves it,
 * since it changes the rent, so this only sends (or shows) the request.
 */
export function FoodOptIn({ foodRequestedAt, foodPlanRent, onChanged, onNotice }: { foodRequestedAt: string | null; foodPlanRent: number | null; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [isSending, setIsSending] = useState(false)

  async function request() {
    setIsSending(true)
    try {
      const response = await fetch('/api/resident-portal/food-request', { method: 'POST' })
      if (!response.ok) { onNotice(await readApiError(response, 'Your request could not be sent.')); return }
      onNotice('Request sent. Your property owner will confirm it.')
      await onChanged()
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={`food-opt-in${foodRequestedAt ? ' is-requested' : ''}`}>
      <UtensilsCrossed size={16} aria-hidden="true" />
      {foodRequestedAt
        ? <p><strong>Food requested on {formatDay(foodRequestedAt)}.</strong> Waiting for your property owner to confirm.</p>
        : <>
          <p><strong>You didn't opt for food.</strong> Need food?{foodPlanRent ? ` Rent with food is ${formatRupees(foodPlanRent)} / month.` : ''}</p>
          <button type="button" className="primary-button" disabled={isSending} onClick={request}>{isSending ? 'Sending…' : 'Opt for food'}</button>
        </>}
    </div>
  )
}
