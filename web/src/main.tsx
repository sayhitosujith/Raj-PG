import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import 'virtual:dark-theme.css'
import 'virtual:admin-brand.css'
// Global, not imported by App.tsx: the sign-in page, resident portal and loaders are styled here too,
// and the owner dashboard is now a separately downloaded screen (lazyPages.ts).
import './App.css'
// The resident portal without green: generated greys, then the hand-set portal colours (in that order).
import './portalNeutral.css'
import './portalTheme.css'
import { applyTheme, currentTheme } from './theme'
import { AppRoutes } from './AppRoutes.tsx'

// Before the first render, so a dark-mode viewer never sees a flash of the light theme.
applyTheme(currentTheme())

// The offline/slow-network worker (public/sw.js). Production only: in development it would serve
// stale modules underneath Vite's hot reload. Registered after load so that on a slow connection it
// does not compete with the first screen for bandwidth.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined) })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoutes />
  </StrictMode>,
)
