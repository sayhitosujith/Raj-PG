import { useState } from 'react'
import { Clock, RotateCw, ShieldAlert, Upload } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { identityDocumentName, readIdentityFields, type DocumentUploads } from './identity'
import { IdentityDocumentFields } from './IdentityDocumentFields'
import type { AadharStatus } from './resident'
import { RefreshButton } from './RefreshButton'
import { readApiError } from './superAdmin'

type VerificationProfile = { name: string; nationality: string; aadharStatus: AadharStatus; aadharRejectionReason?: string | null; aadharSubmittedAt?: string | null }

/** Nationality plus the matching documents; the resident's submission replaces whatever is on file. */
function IdentitySubmissionForm({ defaultNationality, submitLabel, onSubmitted, onCancel }: { defaultNationality: string; submitLabel: string; onSubmitted: () => void; onCancel?: () => void }) {
  const [uploads, setUploads] = useState<DocumentUploads>({})
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/resident-portal/identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...readIdentityFields(new FormData(event.currentTarget)), ...uploads }) })
      if (!response.ok) { setError(await readApiError(response, 'Could not submit your details.')); return }
      onSubmitted()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="resident-password-form" onSubmit={submit}>
      <IdentityDocumentFields defaultNationality={defaultNationality} required onUpload={(chosen) => setUploads((current) => ({ ...current, ...chosen }))} onError={setError} />
      {error && <p className="login-error" role="alert">{error}</p>}
      <div className="modal-actions">{onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}<button type="submit" className="primary-button" disabled={isSaving}><Upload size={16} /> {isSaving ? 'Submitting…' : submitLabel}</button></div>
    </form>
  )
}

/**
 * Shown to a signed-in resident until their ID is approved by the owner or a receptionist: Aadhaar for Indian nationals,
 * passport and visa for everyone else. The server refuses portal data until then, so this is the
 * only thing a resident can do besides signing out.
 */
export function ResidentIdVerification({ profile, lastRefreshedAt, onRefresh, onChanged, onSignOut }: { profile: VerificationProfile; lastRefreshedAt: Date; onRefresh: () => Promise<void>; onChanged: () => void; onSignOut: () => void }) {
  const [isReplacing, setIsReplacing] = useState(false)
  const firstName = profile.name.split(' ')[0]
  const submittedOn = profile.aadharSubmittedAt ? new Date(profile.aadharSubmittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const isPending = profile.aadharStatus === 'PENDING'
  const documentName = identityDocumentName(profile.nationality)

  return (
    <main className="login-shell">
      <div className="login-card verification-card">
        <RefreshButton className="card-refresh" onRefresh={onRefresh} lastUpdated={lastRefreshedAt} />
        <div className="brand-row"><BrandMark /></div>
        <p className="eyebrow">Welcome, {firstName}</p>
        <h1>{isPending && !isReplacing ? 'Verification in review' : 'Verify your ID'}</h1>
        {profile.aadharStatus === 'REJECTED' && <div className="verification-callout is-rejected"><ShieldAlert size={16} /><div><strong>Your last submission was not accepted</strong><p>{profile.aadharRejectionReason || 'Please submit your details again.'}</p></div></div>}
        {isPending && !isReplacing
          ? <>
              <div className="verification-callout is-pending"><Clock size={16} /><div><strong>Submitted{submittedOn ? ` on ${submittedOn}` : ''}</strong><p>Your property owner or receptionist will check your {documentName === 'Aadhaar' ? 'Aadhaar card' : 'passport and visa'}. You will get full access as soon as it is approved.</p></div></div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsReplacing(true)}>Replace submission</button><button type="button" className="primary-button" onClick={onChanged}><RotateCw size={15} /> Check status</button></div>
            </>
          : <>
              <p className="login-hint">Your property owner or receptionist needs to verify your ID before you can use your resident account. Indian citizens use their Aadhaar card; everyone else uses their passport and Indian visa. Uploads can be a clear photo or PDF, up to 2 MB.</p>
              <IdentitySubmissionForm defaultNationality={profile.nationality} submitLabel={isReplacing ? 'Replace submission' : 'Submit for verification'} onSubmitted={() => { setIsReplacing(false); onChanged() }} onCancel={isReplacing ? () => setIsReplacing(false) : undefined} />
            </>}
        <button type="button" className="text-link portal-signout" onClick={onSignOut}>Sign out</button>
      </div>
    </main>
  )
}
