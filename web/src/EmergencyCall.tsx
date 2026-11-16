import { Ambulance, Flame, Phone, ShieldAlert, Siren, type LucideIcon } from 'lucide-react'
import { GmailIcon } from './GmailIcon'
import { whatsappLink } from './siteData'
import { WhatsAppIcon } from './WhatsAppIcon'

// Plain tel: links, so they dial straight away on a phone and hand off to a calling app elsewhere.

/** India's single emergency number (112 reaches police, fire and ambulance), as a tap-to-call button. */
export function EmergencyButton() {
  return <a className="emergency-button is-sos" href="tel:112" aria-label="Call emergency services on 112"><Siren size={14} /><span className="emergency-label">Emergency</span></a>
}

const directLines: { label: string; number: string; icon: LucideIcon }[] = [
  { label: 'Police', number: '100', icon: ShieldAlert },
  { label: 'Ambulance', number: '108', icon: Ambulance },
  { label: 'Fire', number: '101', icon: Flame },
]

/**
 * India's direct lines for police, ambulance and fire, one tap each: the numbers residents know, and
 * 108 is the ambulance line most states run.
 */
export function EmergencyNumbers() {
  return (
    <div className="emergency-numbers">
      {directLines.map(({ label, number, icon: Icon }) => (
        <a key={number} className="emergency-number" href={`tel:${number}`} aria-label={`Call ${label.toLowerCase()} on ${number}`}><Icon size={16} aria-hidden="true" /><strong>{label}</strong><span>{number}</span></a>
      ))}
    </div>
  )
}

/** Tap-to-call for the receptionist (the property's manager number); renders nothing when no number is set. */
export function CallOwnerButton({ ownerName, ownerPhone }: { ownerName: string; ownerPhone: string | null }) {
  if (!ownerPhone) return null
  return <a className="emergency-button call-owner icon-only" href={`tel:${ownerPhone}`} aria-label={`Call the receptionist at ${ownerName} on ${ownerPhone}`} title="Call receptionist"><Phone size={16} /></a>
}

/**
 * Opens a WhatsApp chat with the receptionist, with "Hi" typed. The bot (rent, Wi-Fi, FAQs, repairs) wins when
 * it is on, since "Hi" brings up its menu; until then it is the receptionist's own number, the one Receptionist
 * calls, so residents can message the desk from day one. Renders nothing when neither exists.
 */
export function WhatsAppReceptionButton({ businessName, botNumber, receptionistPhone }: { businessName: string; botNumber: string | null | undefined; receptionistPhone: string | null }) {
  const number = botNumber || receptionistPhone
  if (!number) return null
  return <a className="emergency-button call-owner icon-only whatsapp" href={whatsappLink(number, 'Hi')} target="_blank" rel="noopener noreferrer" aria-label={`Chat with the ${businessName} receptionist on WhatsApp`} title="WhatsApp"><WhatsAppIcon size={17} /></a>
}

/**
 * Opens the resident's email app to the receptionist (of their property, else Settings' contact email), with a subject naming who is
 * writing and from which room, so the desk can tell residents apart without asking. Nothing when no email is set.
 */
export function EmailReceptionButton({ businessName, email, subject }: { businessName: string; email: string | null; subject: string }) {
  if (!email) return null
  return <a className="emergency-button call-owner icon-only gmail" href={`mailto:${email}?subject=${encodeURIComponent(subject)}`} aria-label={`Email the ${businessName} receptionist at ${email}`} title="Email receptionist"><GmailIcon size={18} /></a>
}
