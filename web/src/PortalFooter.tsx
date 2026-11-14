import { useState } from 'react'
import indiaFlag from 'flag-icons/flags/4x3/in.svg'
import { ReferralShare } from './ReferralShare'
import { PolicyDialog, type Policy } from './PolicyDialog'

/**
 * The resident portal's footer: links to the resident policies, each opening in a modal,
 * refer-a-friend share icons, and a "Made in India" mark on its own line at the bottom. A policy the
 * owner cleared in Settings is left out; the mark stays even when both are cleared. The flag is an
 * SVG because emoji flags show as letters on Windows.
 */
export function PortalFooter({ businessName, termsAndConditions, privacyPolicy, referralCode, showReferral = true, onNotice }: { businessName: string; termsAndConditions: string; privacyPolicy: string; referralCode?: string | null; /** False while Refer a friend is switched off in Settings. */ showReferral?: boolean; onNotice: (message: string) => void }) {
  const [open, setOpen] = useState<Policy | null>(null)
  const policies = [{ title: 'Terms and conditions', text: termsAndConditions }, { title: 'Privacy policy', text: privacyPolicy }].filter((policy) => policy.text)
  return (
    <>
      <footer className="portal-terms">
        {policies.length > 0 && <span>Please go through our{' '}
          {policies.map((policy, index) => <span key={policy.title}>{index > 0 && ' and '}<button type="button" className="text-link" onClick={() => setOpen(policy)}>{policy.title}</button></span>)}
        </span>}
        {showReferral && <ReferralShare businessName={businessName} referralCode={referralCode} onNotice={onNotice} />}
        <span className="made-in-india">Made in India <img src={indiaFlag} alt="" width={18} height={13} /></span>
      </footer>
      {open && <PolicyDialog businessName={businessName} policy={open} onClose={() => setOpen(null)} />}
    </>
  )
}
