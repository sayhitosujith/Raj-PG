import { Phone, Siren } from 'lucide-react'

// Plain tel: links, so they dial straight away on a phone and hand off to a calling app elsewhere.

/** India's single emergency number (112 reaches police, fire and ambulance), as a tap-to-call button. */
export function EmergencyButton() {
  return <a className="emergency-button is-sos" href="tel:112" aria-label="Call emergency services on 112"><Siren size={14} /> Emergency</a>
}

/** Tap-to-call for the receptionist (the property's manager number); renders nothing when no number is set. */
export function CallOwnerButton({ ownerName, ownerPhone }: { ownerName: string; ownerPhone: string | null }) {
  if (!ownerPhone) return null
  return <a className="emergency-button call-owner" href={`tel:${ownerPhone}`} aria-label={`Call the receptionist at ${ownerName} on ${ownerPhone}`}><Phone size={14} /> Receptionist</a>
}
