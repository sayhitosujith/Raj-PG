import { memberTierLabels, type MemberTier } from './memberTier'
import { useNetworkStatus } from './networkStatus'

/**
 * The line under the resident's name in the portal header: their membership tier (left out while the
 * tier is switched off in Settings, `tier` null), then a dot showing whether this device is online
 * (green) or offline (grey). The resident is always the one viewing, so "online" can only mean their
 * connection; it follows the browser's offline event, the same signal the offline banner uses.
 */
export function MemberStatus({ tier }: { tier: MemberTier | null }) {
  const { online } = useNetworkStatus()
  return (
    <p className="portal-member-line">
      {tier && <span className={`portal-member-tier is-${tier.toLowerCase()}`}>{memberTierLabels[tier]} member</span>}
      {/* Only the dot shows; the word stays for screen readers and as a hover hint. */}
      <span className={`portal-online${online ? '' : ' is-offline'}`} title={online ? 'Online' : 'Offline'}><span className="sr-only">{online ? 'Online' : 'Offline'}</span></span>
    </p>
  )
}
