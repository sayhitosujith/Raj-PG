import { useState } from 'react'
import { readApiError } from './superAdmin'

/**
 * Owner's decision on a resident's request to join the food plan. Approving is an ordinary update
 * to "with food" (so rent follows the property's price); declining just clears the request.
 */
export function FoodRequestReview({ residentId, residentName, requestedAt, rentFromProperty, onChanged, onNotice }: { residentId: string; residentName: string; requestedAt: string; rentFromProperty: boolean; onChanged: () => void; onNotice: (message: string) => void }) {
  const [isSaving, setIsSaving] = useState(false)

  async function decide(approve: boolean) {
    setIsSaving(true)
    try {
      const response = approve
        ? await fetch(`/api/residents/${residentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ foodOpted: true }) })
        : await fetch(`/api/residents/${residentId}/food-request`, { method: 'DELETE' })
      if (!response.ok) { onNotice(await readApiError(response, 'Could not update the food plan.')); return }
      onNotice(!approve ? `Declined ${residentName}'s food request.` : rentFromProperty ? `${residentName} is now on the food plan; rent updated to the property's with-food price.` : `${residentName} is now on the food plan. Rent is unchanged: set this property's food prices (Edit property) or edit the resident's rent.`)
      onChanged()
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <span className="food-request-review">
      <small>Requested food on {new Date(requestedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small>
      {!rentFromProperty && <small className="food-request-warning">This property has no food prices, so approving won't change the rent.</small>}
      <span className="food-request-actions">
        <button type="button" className="secondary-button" disabled={isSaving} onClick={() => decide(false)}>Decline</button>
        <button type="button" className="primary-button" disabled={isSaving} onClick={() => decide(true)}>Approve</button>
      </span>
    </span>
  )
}
