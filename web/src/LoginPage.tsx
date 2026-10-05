import { useEffect, useState } from 'react'
import { Fingerprint, LogIn } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { canUseDeviceUnlock, signInWithPasskey } from './passkeys'
import type { SessionResponse } from './session'
import { ThemeToggle } from './ThemeToggle'
import { readApiError } from './superAdmin'

/**
 * One sign-in form for super admins and residents. The server works out the account type from
 * the credentials, so nobody has to pick a role first. Residents who turned on Face ID /
 * fingerprint sign-in in their profile also get a one-tap button, shown only on devices that can use it.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (session: SessionResponse) => void }) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [canUsePasskey, setCanUsePasskey] = useState(false)

  useEffect(() => { void canUseDeviceUnlock().then(setCanUsePasskey) }, [])

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: form.get('identifier'), password: form.get('password') }) })
      if (!response.ok) { setError(await readApiError(response, 'Could not sign in.')); return }
      onSignedIn(await response.json() as SessionResponse)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function signInWithDevice() {
    setIsSubmitting(true)
    setError('')
    try {
      const session = await signInWithPasskey()
      if (session) onSignedIn(session)
    } catch (failure) {
      setError(failure instanceof Error && failure.message !== 'Failed to fetch' ? failure.message : 'Could not reach the server.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-shell has-city">
      {/* Decorative city photo at sunset behind the card; styled in App.css (.city-backdrop). */}
      <div className="city-backdrop" aria-hidden="true" />
      <form className="login-card login-card-themed" onSubmit={signIn}>
        <ThemeToggle className="card-theme-toggle" />
        <div className="brand-row"><BrandMark /></div>
        <h1>Sign in</h1>
        <label>Email<input name="identifier" type="text" inputMode="email" autoComplete="username" required autoFocus placeholder="Enter your email ID" /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" /></label>
        <p className="login-hint">Resident signing in for the first time? Enter the access key from your property owner as your password.</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button" disabled={isSubmitting}><LogIn size={16} /> {isSubmitting ? 'Signing in…' : 'Sign in'}</button>
        {canUsePasskey && <>
          <p className="login-divider"><span>or</span></p>
          <button type="button" className="secondary-button login-passkey" disabled={isSubmitting} onClick={() => void signInWithDevice()}><Fingerprint size={16} /> Sign in with Face ID / fingerprint</button>
          <p className="login-hint">Residents: turn this on first in Profile after signing in with your password.</p>
        </>}
      </form>
    </main>
  )
}
