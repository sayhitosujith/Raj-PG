import App from './App.tsx'
import { AuthGate } from './AuthGate'
import { BookingRequestPage } from './BookingRequestPage'
import { isBookingPage } from './booking'
import { PublicSite } from './PublicSite'
import { isPublicSitePath, usePathname } from './router'

/**
 * What the address shows: the booking form (/book) and the website's inner pages need no sign-in, so
 * they skip the auth gate; everything else goes through it, which shows the website's home page at "/"
 * to signed-out visitors and the sign-in page at /login.
 */
export function AppRoutes() {
  const path = usePathname()
  if (isBookingPage()) return <BookingRequestPage />
  if (isPublicSitePath(path)) return <PublicSite path={path} />
  return <AuthGate>{(admin, signOut, onAdminChange) => <App currentAdmin={admin} onSignOut={signOut} onAdminChange={onAdminChange} />}</AuthGate>
}
