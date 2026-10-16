import { Ambulance, Flame, Phone, ShieldAlert, Siren, type LucideIcon } from 'lucide-react'

// Plain tel: links, so they dial straight away on a phone and hand off to a calling app elsewhere.

/** India's single emergency number (112 reaches police, fire and ambulance), as a tap-to-call button. */
export function EmergencyButton() {
  return <a className="emergency-button is-sos" href="tel:112" aria-label="Call emergency services on 112"><Siren size={14} /> Emergency</a>
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
  return <a className="emergency-button call-owner" href={`tel:${ownerPhone}`} aria-label={`Call the receptionist at ${ownerName} on ${ownerPhone}`}><Phone size={14} /> Receptionist</a>
}
