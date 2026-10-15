import { useState, type ReactNode } from 'react'
import { Building2, ChevronRight, Clock, Copy, DoorOpen, Eye, EyeOff, Globe, HelpCircle, MapPin, Phone, Wifi, X } from 'lucide-react'
import { copyWithNotice } from './clipboard'
import { LocationLink } from './LocationLink'
import { ModalLayer } from './ModalLayer'
import { FeatureRibbon, FeatureTag, useFeatureBadge } from './FeatureBadges'

/** The Info tab's data, as /resident-portal/me sends it (see the backend's residentInfo.ts). */
export type ResidentInfoData = {
  wifi: { name: string; password: string | null } | null
  contacts: Array<{ label: string; phone: string }>
  times: { checkIn: string | null; checkOut: string | null; gateClosing: string | null }
  /** Property name, so a typed area opens the right map search. */
  property: string
  location: string
  city: string
  /** The PG's own website, if the owner added one. */
  website: string | null
  rules: string[]
  faqs: Array<{ question: string; answer: string }>
}

// "22:30" → "10:30 pm".
const clockLabel = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}` }

/** Wi-Fi name and password with copy buttons; the password is hidden until tapped. */
function WifiCard({ wifi, onNotice }: { wifi: NonNullable<ResidentInfoData['wifi']>; onNotice: (message: string) => void }) {
  const [isShown, setIsShown] = useState(false)
  return (
    <div className="info-card is-wifi">
      <h3><Wifi size={16} /> Wi-Fi</h3>
      <div className="info-line"><span>Network</span><strong>{wifi.name}</strong><button type="button" className="icon-button" aria-label="Copy network name" onClick={() => copyWithNotice(wifi.name, 'Network name', onNotice)}><Copy size={14} /></button></div>
      {wifi.password && <div className="info-line"><span>Password</span><strong className="info-secret">{isShown ? wifi.password : '••••••••'}</strong>
        <button type="button" className="icon-button" aria-label={isShown ? 'Hide password' : 'Show password'} onClick={() => setIsShown((shown) => !shown)}>{isShown ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button type="button" className="icon-button" aria-label="Copy password" onClick={() => copyWithNotice(wifi.password ?? '', 'Wi-Fi password', onNotice)}><Copy size={14} /></button></div>}
    </div>
  )
}

/**
 * The property's useful details on Home: Wi-Fi, important contacts (tap to call), the property's city
 * and location (a map link), and check-in / check-out / gate times. Each card appears only when the
 * owner has filled it in. FAQs are separate, on the Info tab (ResidentFaqs). `action` sits beside the
 * heading (the portal puts "Receptionist" there), and keeps the section showing even with no details.
 */
export function ResidentInfo({ info, onNotice, action }: { info: ResidentInfoData; onNotice: (message: string) => void; action?: ReactNode }) {
  const times = [['Check-in', info.times.checkIn], ['Check-out', info.times.checkOut], ['Gate closes', info.times.gateClosing]].filter((entry): entry is [string, string] => Boolean(entry[1]))
  const hasDetails = Boolean(info.city || info.location || info.website) || times.length > 0
  if (!info.wifi && !info.contacts.length && !hasDetails && !action) return null
  return (
    <section className="workspace-view resident-info">
      <div className="workspace-view-heading"><div><p className="eyebrow">Good to know</p><h2>Property info</h2><p>Wi-Fi, contacts and timings from your property owner.</p></div>{action}</div>
      <div className="info-grid">
        {info.wifi && <WifiCard wifi={info.wifi} onNotice={onNotice} />}
        {info.contacts.length > 0 && <div className="info-card is-contacts">
          <h3><Phone size={16} /> Important contacts</h3>
          {info.contacts.map((contact) => <div className="info-line" key={`${contact.label}-${contact.phone}`}><span>{contact.label}</span>{contact.phone ? <a className="info-call" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}><Phone size={12} /> {contact.phone}</a> : <strong />}</div>)}
        </div>}
        {hasDetails && <div className="info-card is-details">
          <h3><DoorOpen size={16} /> Property details</h3>
          {info.city && <div className="info-line"><span><Building2 size={12} /> City</span><strong>{info.city}</strong></div>}
          {info.location && <div className="info-line"><span><MapPin size={12} /> Location</span><LocationLink className="info-call" property={info.property} location={info.location} /></div>}
          {info.website && <div className="info-line"><span><Globe size={12} /> Website</span><a className="info-call" href={info.website} target="_blank" rel="noopener noreferrer">Visit website</a></div>}
          {times.map(([label, time]) => <div className="info-line" key={label}><span><Clock size={12} /> {label}</span><strong>{clockLabel(time)}</strong></div>)}
        </div>}
      </div>
    </section>
  )
}

/**
 * The owner's FAQs on the Info tab as one compact card (how many questions there are); tapping it
 * opens them in a pop-up, where each question unfolds to its answer, so the tab stays short. The owner's
 * banner for it (Settings > Feature banners) shows in the corner; "New" goes once it is opened. Read-only. Nothing when the owner has written none.
 */
export function ResidentFaqs({ faqs }: { faqs: ResidentInfoData['faqs'] }) {
  const [isOpen, setIsOpen] = useState(false)
  const { ribbon, tag, markSeen } = useFeatureBadge('faqs')
  if (!faqs.length) return null
  function open() {
    setIsOpen(true)
    markSeen()
  }
  return (
    <section className="workspace-view resident-faqs">
      <button type="button" className="faq-card" onClick={open}>
        {ribbon && <FeatureRibbon badge={ribbon} />}
        <span className="faq-card-icon" aria-hidden="true"><HelpCircle size={20} /></span>
        <span className="faq-card-copy"><strong>FAQs{tag && <FeatureTag badge={tag} />}</strong><small>{faqs.length} common {faqs.length === 1 ? 'question' : 'questions'}, answered by your property owner</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      {isOpen && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)}>
        <div className="profile-modal faq-modal" role="dialog" aria-modal="true" aria-labelledby="faq-title">
          <div className="modal-heading"><div><p className="eyebrow">Help</p><h2 id="faq-title">FAQs</h2></div><button type="button" className="icon-button" aria-label="Close FAQs" onClick={() => setIsOpen(false)}><X size={18} /></button></div>
          <div className="faq-list">
            {faqs.map((faq) => <details key={faq.question}><summary><HelpCircle size={15} aria-hidden="true" />{faq.question}</summary>{faq.answer && <p>{faq.answer}</p>}</details>)}
          </div>
        </div>
      </div></ModalLayer>}
    </section>
  )
}
