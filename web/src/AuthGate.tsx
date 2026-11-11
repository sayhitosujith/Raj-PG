import { useEffect, useState, type ReactNode } from 'react'
import { ConnectionProblem } from './ConnectionProblem'
import { LoginPage, PublicSite, ResidentPortal } from './lazyPages'
import type { SessionResponse } from './session'
import type { SuperAdmin } from './superAdmin'
import { PageLoader } from './Loader'
import { navigate, sitePaths, usePathname } from './router'
import { subscriptionEndedCode } from './subscriptions'

type AuthState = { status: 'checking' } | { status: 'unreachable' } | { status: 'signed-out'; notice?: string; isError?: boolean } | { status: 'super-admin'; admin: SuperAdmin } | { status: 'resident' }

/**
 * Picks the experience for the current session: the owner dashboard for super admins, the resident
 * portal for residents, and for visitors who are not signed in the sign-in page at /login or the
 * public website everywhere else. Signing in returns to "/", signing out goes to /login. The
 * dashboard is a render prop so it receives the admin and sign-out action without a context layer.
 */
export function AuthGate({ children }: { children: (admin: SuperAdmin, signOut: (reason?: string) => Promise<void>, onAdminChange: (admin: SuperAdmin) => void) => ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' })
  const path = usePathname()

  function checkSession() {
    fetch('/api/auth/session')
      .then(async (response) => {
        if (response.ok) { applySession(await response.json() as SessionResponse); return }
        // A receptionist whose subscription ended is sent to sign-in with the reason, not to the public site.
        const body = await response.json().catch(() => ({})) as { error?: string; code?: string }
        if (body.code === subscriptionEndedCode) { showSignIn(body.error, true); return }
        setAuth({ status: 'signed-out' })
      })
      // No answer at all says nothing about the session: treating it as signed out dropped signed-in
      // people onto the public website whenever the signal blipped. (Offline with a saved session, the
      // service worker answers instead and this is not reached.)
      .catch(() => setAuth({ status: 'unreachable' }))
  }
  useEffect(() => { checkSession() }, [])

  function applySession(session: SessionResponse) {
    if (window.location.pathname === sitePaths.login) navigate(sitePaths.home, { replace: true })
    setAuth(session.role === 'SUPER_ADMIN' ? { status: 'super-admin', admin: session.admin } : { status: 'resident' })
  }

  function showSignIn(notice: string | undefined, isError: boolean) {
    navigate(sitePaths.login, { replace: true })
    setAuth({ status: 'signed-out', notice, isError })
  }

  /** Signs out; a reason (e.g. the subscription ended) is shown on the sign-in page as an error. */
  async function signOut(reason?: string) {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    showSignIn(reason ?? 'You have been logged out successfully.', Boolean(reason))
  }

  if (auth.status === 'checking') return <PageLoader />
  if (auth.status === 'unreachable') return <ConnectionProblem onRetry={() => { setAuth({ status: 'checking' }); checkSession() }} />
  if (auth.status === 'signed-out') return path === sitePaths.login ? <LoginPage onSignedIn={applySession} notice={auth.notice} noticeIsError={auth.isError} /> : <PublicSite path={path} />
  if (auth.status === 'resident') return <ResidentPortal onSignOut={signOut} />
  return children(auth.admin, signOut, (admin) => setAuth({ status: 'super-admin', admin }))
}
