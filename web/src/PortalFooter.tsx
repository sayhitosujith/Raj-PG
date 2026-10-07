import { useState } from 'react'
import { X } from 'lucide-react'
import indiaFlag from 'flag-icons/flags/4x3/in.svg'
import { ReferralShare } from './ReferralShare'
import { ModalLayer } from './ModalLayer'

type Policy = { title: string; text: string }

/**
 * The resident portal's footer: links to the resident policies, each opening in a modal,
 * refer-a-friend share icons, and a "Made in India" mark on its own line at the bottom. A policy the
 * owner cleared in Settings is left out; the mark stays even when both are cleared. The flag is an
 * SVG because emoji flags show as letters on Windows.
 */
export function PortalFooter({ businessName, termsAndConditions, privacyPolicy, referralCode, onNotice }: { businessName: string; termsAndConditions: string; privacyPolicy: string; referralCode?: string | null; onNotice: (message: string) => void }) {
  const [open, setOpen] = useState<Policy | null>(null)
  const policies = [{ title: 'Terms and conditions', text: termsAndConditions }, { title: 'Privacy policy', text: privacyPolicy }].filter((policy) => policy.text)
  return (
    <>
      <footer className="portal-terms">
        {policies.length > 0 && <span>Please go through our{' '}
          {policies.map((policy, index) => <span key={policy.title}>{index > 0 && ' and '}<button type="button" className="text-link" onClick={() => setOpen(policy)}>{policy.title}</button></span>)}
        </span>}
        <ReferralShare businessName={businessName} referralCode={referralCode} onNotice={onNotice} />
        <span className="made-in-india">Made in India <img src={indiaFlag} alt="" width={18} height={13} /></span>
      </footer>
      {open && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(null)}><div className="profile-modal terms-modal" role="dialog" aria-labelledby="policy-title"><div className="modal-heading"><div><p className="eyebrow">{businessName}</p><h2 id="policy-title">{open.title}</h2></div><button type="button" className="icon-button" aria-label={`Close ${open.title.toLowerCase()}`} onClick={() => setOpen(null)}><X size={18} /></button></div><p className="terms-text">{open.text}</p></div></div></ModalLayer>}
    </>
  )
}
