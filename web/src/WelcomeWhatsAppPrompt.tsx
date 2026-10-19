import { X } from 'lucide-react'
import { ModalLayer } from './ModalLayer'
import { WhatsAppIcon } from './WhatsAppIcon'
import type { Resident } from './resident'
import { welcomeMessage, welcomeWhatsAppLink } from './residentWelcome'

/**
 * Shown when the browser blocked opening WhatsApp by itself after a referral became a resident
 * (browsers only open a new tab straight after a click): one tap opens the chat with the welcome typed.
 */
export function WelcomeWhatsAppPrompt({ resident, accessKey, onClose }: { resident: Resident; accessKey: string; onClose: () => void }) {
  const link = welcomeWhatsAppLink(resident, accessKey)
  if (!link) return null
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="profile-modal welcome-whatsapp" role="dialog" aria-labelledby="welcome-whatsapp-title">
        <div className="modal-heading"><div><p className="eyebrow">{resident.name}</p><h2 id="welcome-whatsapp-title">Send welcome on WhatsApp</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <pre className="welcome-whatsapp-text">{welcomeMessage(resident, accessKey)}</pre>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Done</button><a className="primary-button" href={link} target="_blank" rel="noopener noreferrer" onClick={onClose}><WhatsAppIcon size={16} /> Open WhatsApp</a></div>
      </div>
    </div></ModalLayer>
  )
}
