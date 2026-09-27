/** Booking-request sources and statuses; the keys must match the backend's lists in bookings.ts. */
export const bookingSourceLabels = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', google: 'Google', direct: 'Direct link', phone: 'Phone call', walk_in: 'Walk-in' } as const
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
  createdAt: string
}

/** A property as the public booking form sees it (no occupancy or owner-only details). */
export type BookableProperty = { id: string; name: string; location: string; tenantType: 'MEN' | 'WOMEN' | 'COLIVING' | null; rentWithFood: number | null; rentWithoutFood: number | null }

/** The link to share on a platform; `?from=` tags the requests that come through it. */
export const bookingLink = (source: string) => `${window.location.origin}/book${source === 'direct' ? '' : `?from=${source}`}`

/** True on the public booking page (/book), which needs no sign-in. */
export const isBookingPage = () => /^\/book\/?$/.test(window.location.pathname)

/** The API body for the BookingFields inputs in `form`. */
export function readBookingFields(form: FormData) {
  const value = (name: string) => String(form.get(name) ?? '')
  return { name: value('name'), phone: value('phone'), email: value('email'), propertyId: value('propertyId'), moveInDate: value('moveInDate'), foodOpted: value('foodOpted') === 'yes', message: value('message') }
}
