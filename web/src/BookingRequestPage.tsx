import { useEffect, useState } from 'react'
import { CheckCircle2, Phone, Send } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { BookingFields } from './BookingFields'
import { readBookingFields, type BookableProperty } from './booking'
import { InlineLoader } from './Loader'
import { readApiError } from './superAdmin'

type Options = { businessName: string; contactPhone: string | null; properties: BookableProperty[] }

/**
 * The public booking form (/book), shared on social media. `?from=instagram` (etc.) on the link
 * records where each request came from; the server treats unknown values as a direct visit.
 */
export function BookingRequestPage() {
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const source = new URLSearchParams(window.location.search).get('from') ?? 'direct'

  useEffect(() => {
    fetch('/api/public/booking-options')
      .then((response) => response.ok ? response.json() as Promise<Options> : Promise.reject(new Error('load failed')))
      .then(setOptions, () => setLoadError(true))
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsSending(true)
    const response = await fetch('/api/public/booking-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...readBookingFields(form), source, website: form.get('website') }) }).catch(() => null)
    setIsSending(false)
    if (!response?.ok) { setError(response ? await readApiError(response, 'Your request could not be sent.') : 'Could not reach the server. Check your connection and try again.'); return }
    setIsSent(true)
  }

  const call = options?.contactPhone && <a className="secondary-button booking-call" href={`tel:${options.contactPhone}`}><Phone size={15} /> Call {options.contactPhone}</a>

  return (
    <main className="booking-page">
      <div className="booking-card">
        <div className="brand-row booking-brand"><BrandMark /></div>
        {loadError ? <><h1>Booking is unavailable right now</h1><p className="booking-intro">Please try again in a little while.</p></>
          : !options ? <InlineLoader />
          : isSent ? (
            <div className="booking-done" role="status">
              <CheckCircle2 size={44} />
              <h1>Request sent</h1>
              <p className="booking-intro">Thank you! {options.businessName} will contact you soon on the number you gave.</p>
              {call}
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1>Book a room at {options.businessName}</h1>
              <p className="booking-intro">Tell us a little about yourself and we will get back to you, usually the same day.</p>
              <BookingFields properties={options.properties} />
              {/* Honeypot: hidden from people, filled in by naive bots; the server drops those. */}
              <input className="booking-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              {error && <p className="login-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button booking-submit" disabled={isSending}><Send size={16} /> {isSending ? 'Sending…' : 'Send request'}</button>
              {call}
            </form>
          )}
      </div>
    </main>
  )
}
