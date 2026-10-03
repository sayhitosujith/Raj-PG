import { useState } from 'react'
import { Clock, Copy, DoorOpen, Eye, EyeOff, HelpCircle, MapPin, Phone, Wifi } from 'lucide-react'
import { copyWithNotice } from './clipboard'

/** The Info tab's data, as /resident-portal/me sends it (see the backend's residentInfo.ts). */
export type ResidentInfoData = {
  wifi: { name: string; password: string | null } | null
  contacts: Array<{ label: string; phone: string }>
  times: { checkIn: string | null; checkOut: string | null; gateClosing: string | null }
  location: string
  rules: string[]
  faqs: Array<{ question: string; answer: string }>
}

// "22:30" → "10:30 pm".
const clockLabel = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}` }
const isLink = (value: string) => /^https?:\/\//i.test(value)

/** Wi-Fi name and password with copy buttons; the password is hidden until tapped. */
function WifiCard({ wifi, onNotice }: { wifi: NonNullable<ResidentInfoData['wifi']>; onNotice: (message: string) => void }) {
  const [isShown, setIsShown] = useState(false)
  return (
    <div className="info-card">
      <h3><Wifi size={16} /> Wi-Fi</h3>
      <div className="info-line"><span>Network</span><strong>{wifi.name}</strong><button type="button" className="icon-button" aria-label="Copy network name" onClick={() => copyWithNotice(wifi.name, 'Network name', onNotice)}><Copy size={14} /></button></div>
      {wifi.password && <div className="info-line"><span>Password</span><strong className="info-secret">{isShown ? wifi.password : '••••••••'}</strong>
        <button type="button" className="icon-button" aria-label={isShown ? 'Hide password' : 'Show password'} onClick={() => setIsShown((shown) => !shown)}>{isShown ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button type="button" className="icon-button" aria-label="Copy password" onClick={() => copyWithNotice(wifi.password ?? '', 'Wi-Fi password', onNotice)}><Copy size={14} /></button></div>}
    </div>
  )
}

/**
 * The Info tab's useful details: Wi-Fi, important contacts (tap to call), the property's address and
 * check-in / check-out / gate times, and FAQs. Each card appears only when the owner has filled it in.
 */
export function ResidentInfo({ info, onNotice }: { info: ResidentInfoData; onNotice: (message: string) => void }) {
  const times = [['Check-in', info.times.checkIn], ['Check-out', info.times.checkOut], ['Gate closes', info.times.gateClosing]].filter((entry): entry is [string, string] => Boolean(entry[1]))
  const hasDetails = Boolean(info.location) || times.length > 0
  if (!info.wifi && !info.contacts.length && !hasDetails && !info.faqs.length) return null
  return (
    <section className="workspace-view resident-info">
      <div className="workspace-view-heading"><div><p className="eyebrow">Good to know</p><h2>Property info</h2><p>Wi-Fi, contacts and timings from your property owner.</p></div></div>
      <div className="info-grid">
        {info.wifi && <WifiCard wifi={info.wifi} onNotice={onNotice} />}
        {info.contacts.length > 0 && <div className="info-card">
          <h3><Phone size={16} /> Important contacts</h3>
          {info.contacts.map((contact) => <div className="info-line" key={`${contact.label}-${contact.phone}`}><span>{contact.label}</span>{contact.phone ? <a className="info-call" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}><Phone size={12} /> {contact.phone}</a> : <strong />}</div>)}
        </div>}
        {hasDetails && <div className="info-card">
          <h3><DoorOpen size={16} /> Property details</h3>
          {info.location && <div className="info-line"><span><MapPin size={12} /> Address</span>{isLink(info.location) ? <a className="info-call" href={info.location} target="_blank" rel="noreferrer">Directions</a> : <strong>{info.location}</strong>}</div>}
          {times.map(([label, time]) => <div className="info-line" key={label}><span><Clock size={12} /> {label}</span><strong>{clockLabel(time)}</strong></div>)}
        </div>}
      </div>
      {info.faqs.length > 0 && <div className="info-faqs">
        <h3><HelpCircle size={16} /> FAQs</h3>
        {info.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary>{faq.answer && <p>{faq.answer}</p>}</details>)}
      </div>}
    </section>
  )
}
