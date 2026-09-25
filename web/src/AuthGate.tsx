import { useEffect, useState, type ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { ResidentPortal } from './ResidentPortal'
import type { SessionResponse } from './session'
import type { SuperAdmin } from './superAdmin'

type AuthState = { status: 'checking' } | { status: 'signed-out' } | { status: 'super-admin'; admin: SuperAdmin } | { status: 'resident' }

/**
 * Picks the experience for the current session: the owner dashboard for super admins, the
 * resident portal for residents, the login page otherwise. The dashboard is a render prop so it
 * receives the admin and sign-out action without a context layer it does not need.
 */
export function AuthGate({ children }: { children: (admin: SuperAdmin, signOut: () => Promise<void>) => ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' })

  useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => response.ok ? response.json() as Promise<SessionResponse> : Promise.reject(new Error('Not signed in')))
      .then(applySession)
      .catch(() => setAuth({ status: 'signed-out' }))
  }, [])

  function applySession(session: SessionResponse) {
    setAuth(session.role === 'SUPER_ADMIN' ? { status: 'super-admin', admin: session.admin } : { status: 'resident' })
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAuth({ status: 'signed-out' })
  }

  if (auth.status === 'checking') return null
  if (auth.status === 'signed-out') return <LoginPage onSignedIn={applySession} />
  if (auth.status === 'resident') return <ResidentPortal onSignOut={signOut} />
  return children(auth.admin, signOut)
}
