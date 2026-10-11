import { useEffect, useState } from 'react'
import { BrandMark } from './BrandMark'
import { BookingForm, type BookingOptions } from './BookingForm'
import { InlineLoader } from './Loader'

/**
 * The public booking form (/book), shared on social media. `?from=instagram` (etc.) on the link
 * records where each request came from; the server treats unknown values as a direct visit.
 */
export function BookingRequestPage() {
  const [options, setOptions] = useState<BookingOptions | null>(null)
  const [loadError, setLoadError] = useState(false)
  const query = new URLSearchParams(window.location.search)
  const source = query.get('from') ?? 'direct'
  // A resident's referral code from their "Refer a friend" link: earns them a reward when this friend joins.
  const referralCode = query.get('ref')

  useEffect(() => {
    fetch('/api/public/booking-options')
      .then((response) => response.ok ? response.json() as Promise<BookingOptions> : Promise.reject(new Error('load failed')))
      .then(setOptions, () => setLoadError(true))
  }, [])

  return (
    <main className="booking-page">
      <div className="booking-card">
        <div className="brand-row booking-brand"><BrandMark /></div>
        {loadError ? <><h1>Booking is unavailable right now</h1><p className="booking-intro">Please try again in a little while.</p></>
          : !options ? <InlineLoader />
          : <BookingForm options={options} source={source} referralCode={referralCode} />}
      </div>
    </main>
  )
}
