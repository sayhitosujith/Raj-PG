import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'virtual:dark-theme.css'
import 'virtual:admin-brand.css'
import { applyTheme, currentTheme } from './theme'
import App from './App.tsx'
import { AuthGate } from './AuthGate.tsx'
import { BookingRequestPage } from './BookingRequestPage.tsx'
import { isBookingPage } from './booking'

// Before the first render, so a dark-mode viewer never sees a flash of the light theme.
applyTheme(currentTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The public booking form needs no sign-in, so it skips the auth gate entirely. */}
    {isBookingPage() ? <BookingRequestPage /> : <AuthGate>{(admin, signOut, onAdminChange) => <App currentAdmin={admin} onSignOut={signOut} onAdminChange={onAdminChange} />}</AuthGate>}
  </StrictMode>,
)
