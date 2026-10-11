import { X } from 'lucide-react'
import { ModalLayer } from './ModalLayer'

/** A policy to read: its title ("Terms and conditions") and the owner's text. */
export type Policy = { title: string; text: string }

/** The owner's Terms or Privacy policy in a modal, from the resident portal's footer and the website's. */
export function PolicyDialog({ businessName, policy, onClose }: { businessName: string; policy: Policy; onClose: () => void }) {
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="profile-modal terms-modal" role="dialog" aria-labelledby="policy-title">
        <div className="modal-heading"><div><p className="eyebrow">{businessName}</p><h2 id="policy-title">{policy.title}</h2></div><button type="button" className="icon-button" aria-label={`Close ${policy.title.toLowerCase()}`} onClick={onClose}><X size={18} /></button></div>
        <p className="terms-text">{policy.text}</p>
      </div>
    </div></ModalLayer>
  )
}
