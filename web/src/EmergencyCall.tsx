import { Phone, Siren } from 'lucide-react'

/**
 * Tap-to-call buttons in the resident's "My details" heading: India's single emergency number
 * (112 reaches police, fire and ambulance) and, when the owner has set one, their contact phone.
 * Plain tel: links, so they dial straight away on a phone and hand off to a calling app elsewhere.
 */
export function EmergencyCall({ ownerName, ownerPhone }: { ownerName: string; ownerPhone: string | null }) {
  return (
    <div className="emergency-call">
      <a className="emergency-button is-sos" href="tel:112" aria-label="Call emergency services on 112"><Siren size={14} /> Emergency 112</a>
      {ownerPhone && <a className="emergency-button" href={`tel:${ownerPhone}`} aria-label={`Call ${ownerName} on ${ownerPhone}`}><Phone size={14} /> Call owner</a>}
    </div>
  )
}
