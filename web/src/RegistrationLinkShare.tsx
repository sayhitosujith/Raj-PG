import { Copy, MessageCircle } from 'lucide-react'
import { copyWithNotice } from './clipboard'
import { whatsappShareUrl } from './registrationLink'

/**
 * Sends a registration link by hand, for when the app's WhatsApp is off or fails: "Open in WhatsApp" starts a chat
 * with the resident with the message already typed, from the staff member's own WhatsApp; the link can also be copied.
 */
export function RegistrationLinkShare({ name, phone, link, onNotice }: { name: string; phone: string | null | undefined; link: string; onNotice: (message: string) => void }) {
  const shareUrl = whatsappShareUrl(phone, name, link)
  return (
    <div className="registration-link-share">
      {shareUrl && <a className="primary-button" href={shareUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> Open in WhatsApp</a>}
      <div className="access-key-control registration-link-copy"><input value={link} readOnly aria-label="Registration link" /><button type="button" className="icon-button" aria-label="Copy registration link" title="Copy link" onClick={() => copyWithNotice(link, 'Registration link', onNotice)}><Copy size={16} /></button></div>
    </div>
  )
}
