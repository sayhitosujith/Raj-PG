import { useState } from 'react'
import { Building2, Clock, RotateCw, ShieldAlert, Upload } from 'lucide-react'
import { aadharCardAccept, readAadharCard } from './aadharCard'
import type { AadharStatus } from './resident'
import { RefreshButton } from './RefreshButton'
import { readApiError } from './superAdmin'

type VerificationProfile = { name: string; aadharStatus: AadharStatus; aadharRejectionReason?: string | null; aadharSubmittedAt?: string | null }

/** Number + card upload; the resident's submission replaces whatever is on file. */
function AadharSubmissionForm({ submitLabel, onSubmitted, onCancel }: { submitLabel: string; onSubmitted: () => void; onCancel?: () => void }) {
  const [card, setCard] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function chooseCard(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) { setCard(''); return }
    const result = await readAadharCard(file)
    if ('error' in result) { setError(result.error); input.value = ''; setCard(''); return }
    setError('')
    setCard(result.dataUrl)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!card) { setError('Upload a photo or PDF of your Aadhaar card.'); return }
    const aadharNumber = String(new FormData(event.currentTarget).get('aadharNumber') ?? '').replace(/\s/g, '')
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/resident-portal/aadhar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aadharNumber, aadharCardUrl: card }) })
      if (!response.ok) { setError(await readApiError(response, 'Could not submit your Aadhaar details.')); return }
      onSubmitted()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="resident-password-form" onSubmit={submit}>
      <label>Aadhaar number<input name="aadharNumber" inputMode="numeric" autoComplete="off" required pattern="[0-9 ]{12,14}" title="12 digits" placeholder="12-digit number, e.g. 1234 5678 9012" /></label>
      <label className="aadhar-file-label">Aadhaar card (photo or PDF, up to 2 MB)<input type="file" accept={aadharCardAccept} onChange={chooseCard} required /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <div className="modal-actions">{onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}<button type="submit" className="primary-button" disabled={isSaving}><Upload size={16} /> {isSaving ? 'Submitting…' : submitLabel}</button></div>
    </form>
  )
}

/**
 * Shown to a signed-in resident until the owner approves their Aadhaar. The server refuses portal
 * data until then, so this is the only thing a resident can do besides signing out.
 */
export function ResidentAadharVerification({ profile, lastRefreshedAt, onRefresh, onChanged, onSignOut }: { profile: VerificationProfile; lastRefreshedAt: Date; onRefresh: () => Promise<void>; onChanged: () => void; onSignOut: () => void }) {
  const [isReplacing, setIsReplacing] = useState(false)
  const firstName = profile.name.split(' ')[0]
  const submittedOn = profile.aadharSubmittedAt ? new Date(profile.aadharSubmittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const isPending = profile.aadharStatus === 'PENDING'

  return (
    <main className="login-shell">
      <div className="login-card verification-card">
        <RefreshButton className="card-refresh" onRefresh={onRefresh} lastUpdated={lastRefreshedAt} />
        <div className="brand-row"><div className="brand-mark"><Building2 size={19} strokeWidth={2.5} /></div><span>raj<span className="brand-accent">.</span>pg</span></div>
        <p className="eyebrow">Welcome, {firstName}</p>
        <h1>{isPending && !isReplacing ? 'Verification in review' : 'Verify your Aadhaar'}</h1>
        {profile.aadharStatus === 'REJECTED' && <div className="verification-callout is-rejected"><ShieldAlert size={16} /><div><strong>Your last submission was not accepted</strong><p>{profile.aadharRejectionReason || 'Please submit your details again.'}</p></div></div>}
        {isPending && !isReplacing
          ? <>
              <div className="verification-callout is-pending"><Clock size={16} /><div><strong>Submitted{submittedOn ? ` on ${submittedOn}` : ''}</strong><p>Your property owner will check your Aadhaar card. You will get full access as soon as it is approved.</p></div></div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsReplacing(true)}>Replace submission</button><button type="button" className="primary-button" onClick={onChanged}><RotateCw size={15} /> Check status</button></div>
            </>
          : <>
              <p className="login-hint">Your property owner needs to verify your Aadhaar before you can use your resident account. Enter your number and upload a clear photo or PDF of your card.</p>
              <AadharSubmissionForm submitLabel={isReplacing ? 'Replace submission' : 'Submit for verification'} onSubmitted={() => { setIsReplacing(false); onChanged() }} onCancel={isReplacing ? () => setIsReplacing(false) : undefined} />
            </>}
        <button type="button" className="text-link portal-signout" onClick={onSignOut}>Sign out</button>
      </div>
    </main>
  )
}
