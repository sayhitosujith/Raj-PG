import { isOnOrBeforeToday } from './identity'

// Expiry dates are calendar days stored at UTC midnight, so they are formatted in UTC to avoid shifting a day.
const formatDay = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/**
 * A passport or visa expiry date, flagged once it has passed: the owner needs fresh documents for
 * Form C, and the resident should renew. Shared by the owner's resident row and the resident portal.
 */
export function ExpiryDate({ value }: { value: string | null | undefined }) {
  if (!value) return <>—</>
  return <>{formatDay(value)}{isOnOrBeforeToday(value) && <span className="expired-note"> · expired</span>}</>
}
