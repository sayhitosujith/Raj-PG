import { useState } from 'react'
import { Building2, LogIn } from 'lucide-react'
import type { SessionResponse } from './session'
import { readApiError } from './superAdmin'

/**
 * One sign-in form for super admins and residents. The server works out the account type from
 * the credentials, so nobody has to pick a role first.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (session: SessionResponse) => void }) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={signIn}>
        <div className="brand-row"><div className="brand-mark"><Building2 size={19} strokeWidth={2.5} /></div><span>raj<span className="brand-accent">.</span>pg</span></div>
        <h1>Sign in</h1>
        <label>Email or phone number<input name="identifier" type="text" inputMode="email" autoComplete="username" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <p className="login-hint">Resident signing in for the first time? Enter the access key from your property owner as your password.</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button" disabled={isSubmitting}><LogIn size={16} /> {isSubmitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}
