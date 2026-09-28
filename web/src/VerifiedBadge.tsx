import { BadgeCheck } from 'lucide-react'

/**
 * "Verified" beside a detail the owner has checked. Only used where a check really happened (the
 * owner's Aadhaar approval covers the Aadhaar number and address), never on typed-in details.
 */
export function VerifiedBadge({ title = 'Checked by your property owner against your Aadhaar card' }: { title?: string }) {
  return <span className="verified-badge" title={title}><BadgeCheck size={12} aria-hidden="true" />Verified</span>
}
