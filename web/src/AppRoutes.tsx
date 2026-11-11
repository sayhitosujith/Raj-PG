import { Suspense } from 'react'
import { AuthGate } from './AuthGate'
import { isBookingPage } from './booking'
import { LoadErrorBoundary } from './ConnectionProblem'
import { BookingRequestPage, OwnerApp, PublicSite, RegistrationPage } from './lazyPages'
import { PageLoader } from './Loader'
import { OfflineBanner } from './OfflineBanner'
import { registrationToken } from './registrationLink'
import { isPublicSitePath, usePathname } from './router'

/**
 * What the address shows: the booking form (/book), a new resident's registration link (/register/<token>) and
 * the website's inner pages need no sign-in, so
 * they skip the auth gate; everything else goes through it, which shows the website's home page at "/"
 * to signed-out visitors and the sign-in page at /login.
 * Every screen is downloaded on first use (see lazyPages.ts); the connection banner sits above them all.
 */
export function AppRoutes() {
  return (
    <>
      <OfflineBanner />
      <LoadErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <CurrentPage />
        </Suspense>
      </LoadErrorBoundary>
    </>
  )
}

function CurrentPage() {
  const path = usePathname()
  if (isBookingPage()) return <BookingRequestPage />
  const token = registrationToken(path)
  if (token) return <RegistrationPage token={token} />
  if (isPublicSitePath(path)) return <PublicSite path={path} />
  return <AuthGate>{(admin, signOut, onAdminChange) => <OwnerApp currentAdmin={admin} onSignOut={signOut} onAdminChange={onAdminChange} />}</AuthGate>
}
