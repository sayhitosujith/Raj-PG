import { useEffect, useState } from 'react'
import { ArrowLeft, Fingerprint, LogIn } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { useBranding, useBrandingAutoRefresh } from './branding'
import { useAdminBrand } from './useAdminBrand'
import { canUseDeviceUnlock, hasPasskeyHere, signInWithPasskey } from './passkeys'
import { readLastProperty } from './lastProperty'
import type { SessionResponse } from './session'
import { ThemeToggle } from './ThemeToggle'
import { readApiError } from './superAdmin'
import { sitePaths } from './router'
import { SiteLink } from './SiteLink'

/**
 * One sign-in form for super admins and residents. The server works out the account type from
 * the credentials, so nobody has to pick a role first. Residents who turned on Face ID /
 * fingerprint sign-in in their profile get a one-tap button on the phone where they turned it on.
 */
export function LoginPage({ onSignedIn, notice, noticeIsError = false }: { onSignedIn: (session: SessionResponse) => void; /** A confirmation to show, e.g. after signing out. */ notice?: string; /** Shows the notice as an error, e.g. why a session was ended. */ noticeIsError?: boolean }) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [canUsePasskey, setCanUsePasskey] = useState(false)
  // The last resident's property on this device, shown instead of the logo; owners and new devices see the logo.
  const [lastProperty] = useState(readLastProperty)
  // The owner's Views colours, as on every other page: the background, button, notices and card follow them.
  useAdminBrand(useBranding().colours)
  useBrandingAutoRefresh()

  // Offered only where this browser saved a passkey; elsewhere the phone would just say it has none.
  useEffect(() => { if (hasPasskeyHere()) void canUseDeviceUnlock().then(setCanUsePasskey) }, [])

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
      onSignedIn(await signInWithPasskey())
    } catch (failure) {
      setError(failure instanceof Error && failure.message !== 'Failed to fetch' ? failure.message : 'Could not reach the server.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-shell login-split">
      {/* Wide screens: the logo above the last resident's property photo on this device, or a welcome line. */}
      <aside className="login-showcase">
        <BrandMark />
        {lastProperty
          ? <figure className="login-showcase-photo"><img src={lastProperty.image} alt={lastProperty.name} /><figcaption>{lastProperty.name}</figcaption></figure>
          : <p className="login-welcome"><strong>Welcome home.</strong> Sign in to see your rent, meals, requests and more.</p>}
      </aside>
      {/* The sign-in card on a curved two-tone background in the theme colour; shapes styled in App.css. */}
      <section className="login-stage">
        <span className="login-curve is-pale" aria-hidden="true" />
        <span className="login-curve is-light" aria-hidden="true" />
        <span className="login-rings" aria-hidden="true" />
        <form className="login-card login-card-themed" onSubmit={signIn}>
          <ThemeToggle className="card-theme-toggle" />
          <div className="brand-row">{lastProperty ? <figure className="login-property"><img src={lastProperty.image} alt={lastProperty.name} /><figcaption>{lastProperty.name}</figcaption></figure> : <BrandMark />}</div>
          <h1>Sign in</h1>
          <label>Email<input name="identifier" type="text" inputMode="email" autoComplete="username" required autoFocus placeholder="Enter your email ID" /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" /></label>
          <p className="login-hint">Resident signing in for the first time? Enter the access key from your property owner as your password.</p>
          {notice && !error && <p className={noticeIsError ? 'login-error' : 'login-success'} role={noticeIsError ? 'alert' : 'status'}>{notice}</p>}
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={isSubmitting}><LogIn size={16} /> {isSubmitting ? 'Signing in…' : 'Sign in'}</button>
          {canUsePasskey && <>
            <p className="login-divider"><span>or</span></p>
            <button type="button" className="secondary-button login-passkey" disabled={isSubmitting} onClick={() => void signInWithDevice()}><Fingerprint size={16} /> Sign in with Face ID / fingerprint</button>
          </>}
          <SiteLink to={sitePaths.home} className="login-back"><ArrowLeft size={14} aria-hidden="true" /> Back to website</SiteLink>
        </form>
      </section>
    </main>
  )
}
