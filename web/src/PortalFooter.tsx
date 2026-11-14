import { useState } from 'react'
import { logoUrl, useBranding } from './branding'
import { ReferralShare } from './ReferralShare'
import { PolicyDialog, type Policy } from './PolicyDialog'

/**
 * The resident portal's footer: links to the resident policies, each opening in a modal,
 * refer-a-friend share icons, and an "In association with" line naming the workspace with its logo,
 * on its own line at the bottom. A policy the owner cleared in Settings is left out; the line stays
 * even when both are cleared, and shows just the name until a logo is uploaded.
 */
export function PortalFooter({ businessName, termsAndConditions, privacyPolicy, referralCode, showReferral = true, onNotice }: { businessName: string; termsAndConditions: string; privacyPolicy: string; referralCode?: string | null; /** False while Refer a friend is switched off in Settings. */ showReferral?: boolean; onNotice: (message: string) => void }) {
  const [open, setOpen] = useState<Policy | null>(null)
  const { logoVersion } = useBranding()
  const policies = [{ title: 'Terms and conditions', text: termsAndConditions }, { title: 'Privacy policy', text: privacyPolicy }].filter((policy) => policy.text)
  return (
    <>
      <footer className="portal-terms">
        {policies.length > 0 && <span>Please go through our{' '}
          {policies.map((policy, index) => <span key={policy.title}>{index > 0 && ' and '}<button type="button" className="text-link" onClick={() => setOpen(policy)}>{policy.title}</button></span>)}
        </span>}
        {showReferral && <ReferralShare businessName={businessName} referralCode={referralCode} onNotice={onNotice} />}
        {/* The logo stays on its white card (as uploaded): a cut-out logo loses its contrast on the coloured footer. */}
        <span className="portal-association">In association with <strong>{businessName}</strong>{logoVersion && <img className="portal-association-logo" src={logoUrl(logoVersion)} alt="" />}</span>
      </footer>
      {open && <PolicyDialog businessName={businessName} policy={open} onClose={() => setOpen(null)} />}
    </>
  )
}
