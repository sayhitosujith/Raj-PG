import { useState } from 'react'
import { X } from 'lucide-react'

type Policy = { title: string; text: string }

/**
 * Footer line linking to the resident policies, each opening in a modal. A policy the owner
 * cleared in Settings is left out, and the footer disappears when both are cleared.
 */
export function PolicyLinks({ businessName, termsAndConditions, privacyPolicy }: { businessName: string; termsAndConditions: string; privacyPolicy: string }) {
  const [open, setOpen] = useState<Policy | null>(null)
  const policies = [{ title: 'Terms and conditions', text: termsAndConditions }, { title: 'Privacy policy', text: privacyPolicy }].filter((policy) => policy.text)
  if (!policies.length) return null

  return (
    <>
      <footer className="portal-terms">
        Please go through our{' '}
        {policies.map((policy, index) => <span key={policy.title}>{index > 0 && ' and '}<button type="button" className="text-link" onClick={() => setOpen(policy)}>{policy.title}</button></span>)}
      </footer>
      {open && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(null)}><div className="profile-modal terms-modal" role="dialog" aria-labelledby="policy-title"><div className="modal-heading"><div><p className="eyebrow">{businessName}</p><h2 id="policy-title">{open.title}</h2></div><button type="button" className="icon-button" aria-label={`Close ${open.title.toLowerCase()}`} onClick={() => setOpen(null)}><X size={18} /></button></div><p className="terms-text">{open.text}</p></div></div>}
    </>
  )
}
