import { useState } from 'react'
import { CheckCircle2, Phone, Send } from 'lucide-react'
import { BookingFields } from './BookingFields'
import { readBookingFields, type BookableProperty } from './booking'
import { readApiError } from './superAdmin'

/** What the form needs from the business: its name, contact number and the properties to choose from. */
export type BookingOptions = { businessName: string; contactPhone: string | null; properties: BookableProperty[] }

/**
 * The "book a room" request form and its thank-you state, shared by the /book page and the website's
 * Contact page. `source` records where the visitor came from (unknown values count as a direct visit);
 * `referralCode` credits the resident whose "Refer a friend" link they followed.
 */
export function BookingForm({ options, source, referralCode = null, Heading = 'h1' }: { options: BookingOptions; source: string; referralCode?: string | null; /** h1 on its own page, h2 inside the website. */ Heading?: 'h1' | 'h2' }) {
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsSending(true)
    const response = await fetch('/api/public/booking-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...readBookingFields(form), source, referralCode, website: form.get('website') }) }).catch(() => null)
    setIsSending(false)
    if (!response?.ok) { setError(response ? await readApiError(response, 'Your request could not be sent.') : 'Could not reach the server. Check your connection and try again.'); return }
    setIsSent(true)
  }

  const call = options.contactPhone && <a className="secondary-button booking-call" href={`tel:${options.contactPhone}`}><Phone size={15} /> Call {options.contactPhone}</a>

  if (isSent) {
    return (
      <div className="booking-done" role="status">
        <CheckCircle2 size={44} />
        <Heading>Request sent</Heading>
        <p className="booking-intro">Thank you! {options.businessName} will contact you soon on the number you gave.</p>
        {call}
      </div>
    )
  }
  return (
    <form onSubmit={submit}>
      <Heading>Book a room at {options.businessName}</Heading>
      <p className="booking-intro">Tell us a little about yourself and we will get back to you, usually the same day.</p>
      <BookingFields properties={options.properties} />
      {/* Honeypot: hidden from people, filled in by naive bots; the server drops those. */}
      <input className="booking-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button booking-submit" disabled={isSending}><Send size={16} /> {isSending ? 'Sending…' : 'Send request'}</button>
      {call}
    </form>
  )
}
