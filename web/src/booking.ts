/** Booking-request sources and statuses; the keys must match the backend's lists in bookings.ts. */
export const bookingSourceLabels = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', google: 'Google', website: 'Website', direct: 'Direct link', phone: 'Phone call', walk_in: 'Walk-in' } as const
/** Sources a shared link can carry; phone and walk-in are only for requests the owner adds. */
export const shareableSources = ['instagram', 'facebook', 'whatsapp', 'google', 'direct'] as const
export const bookingStatusLabels = { new: 'New', contacted: 'Contacted', accepted: 'Accepted', declined: 'Declined' } as const
export const bookingStatusTones = { new: 'blue', contacted: 'gold', accepted: 'sage', declined: 'muted' } as const

export type BookingSource = keyof typeof bookingSourceLabels
export type BookingStatus = keyof typeof bookingStatusLabels

/** A booking request as returned by /api/bookings. */
export type BookingRequest = {
  id: string
  name: string
  phone: string
  email: string | null
  propertyId: string
  property: string
  moveInDate: string | null
  foodOpted: boolean | null
  message: string
  source: BookingSource
  status: BookingStatus
  residentId: string | null
  /** The resident whose referral link this came through, if any. */
  referredBy: string | null
  createdAt: string
}

/** A property as the public booking form sees it (no occupancy or owner-only details). */
export type BookableProperty = { id: string; name: string; location: string; tenantType: 'MEN' | 'WOMEN' | 'COLIVING' | null; rentWithFood: number | null; rentWithoutFood: number | null }

/** The public booking link tagged with its channel (?from=) and, from a resident's "Refer a friend", their referral code (?ref=). */
export const bookingLink = (source: string, referralCode?: string | null) => {
  const params = new URLSearchParams()
  if (source !== 'direct') params.set('from', source)
  if (referralCode) params.set('ref', referralCode)
  const query = params.toString()
  return `${window.location.origin}/book${query ? `?${query}` : ''}`
}

/** True on the public booking page (/book), which needs no sign-in. */
export const isBookingPage = () => /^\/book\/?$/.test(window.location.pathname)

/** The API body for the BookingFields inputs in `form`. */
export function readBookingFields(form: FormData) {
  const value = (name: string) => String(form.get(name) ?? '')
  return { name: value('name'), phone: value('phone'), email: value('email'), propertyId: value('propertyId'), moveInDate: value('moveInDate'), foodOpted: value('foodOpted') === 'yes', message: value('message') }
}
