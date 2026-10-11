import { useEffect, useState, type ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { ResidentPortal } from './ResidentPortal'
import type { SessionResponse } from './session'
import type { SuperAdmin } from './superAdmin'
import { PageLoader } from './Loader'
import { PublicSite } from './PublicSite'
import { navigate, sitePaths, usePathname } from './router'

type AuthState = { status: 'checking' } | { status: 'signed-out'; notice?: string } | { status: 'super-admin'; admin: SuperAdmin } | { status: 'resident' }

/**
 * Picks the experience for the current session: the owner dashboard for super admins, the resident
 * portal for residents, and for visitors who are not signed in the sign-in page at /login or the
 * public website everywhere else. Signing in returns to "/", signing out goes to /login. The
 * dashboard is a render prop so it receives the admin and sign-out action without a context layer.
 */
export function AuthGate({ children }: { children: (admin: SuperAdmin, signOut: () => Promise<void>, onAdminChange: (admin: SuperAdmin) => void) => ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' })
  const path = usePathname()

  useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => response.ok ? response.json() as Promise<SessionResponse> : Promise.reject(new Error('Not signed in')))
      .then(applySession)
      .catch(() => setAuth({ status: 'signed-out' }))
  }, [])

  function applySession(session: SessionResponse) {
    if (window.location.pathname === sitePaths.login) navigate(sitePaths.home, { replace: true })
    setAuth(session.role === 'SUPER_ADMIN' ? { status: 'super-admin', admin: session.admin } : { status: 'resident' })
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    navigate(sitePaths.login, { replace: true })
    setAuth({ status: 'signed-out', notice: 'You have been logged out successfully.' })
  }

  if (auth.status === 'checking') return <PageLoader />
  if (auth.status === 'signed-out') return path === sitePaths.login ? <LoginPage onSignedIn={applySession} notice={auth.notice} /> : <PublicSite path={path} />
  if (auth.status === 'resident') return <ResidentPortal onSignOut={signOut} />
  return children(auth.admin, signOut, (admin) => setAuth({ status: 'super-admin', admin }))
}
