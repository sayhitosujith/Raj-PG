import { useState } from 'react'
import { FileCheck2 } from 'lucide-react'
import { readApiError } from './superAdmin'
import type { ResidentWorkspace } from './workspaceSettings'

type PolicyField = 'termsAndConditions' | 'privacyPolicy'
/** A policy update the resident has not accepted yet, as the server reports it. */
export type PolicyConsent = { version: string; changed: PolicyField[] }

const titles: Record<PolicyField, string> = { termsAndConditions: 'Terms and conditions', privacyPolicy: 'Privacy policy' }

/**
 * Blocking consent prompt shown after the owner updates a policy. Deliberately has no close
 * button, backdrop click or Escape: it only goes away once the resident accepts (or signs out).
 * The version shown is sent back, so accepting fails if the text changed again meanwhile.
 */
export function PolicyConsentModal({ consent, workspace, onAccepted, onSignOut }: { consent: PolicyConsent; workspace: ResidentWorkspace; onAccepted: (version: string | null) => Promise<void>; onSignOut: () => void }) {
  const [agreed, setAgreed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const names = consent.changed.map((field) => titles[field]).join(' and ')

  async function accept() {
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/resident-portal/policies/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: consent.version }) })
      if (response.ok) { await onAccepted(consent.version); return }
      const message = await readApiError(response, 'Your acceptance could not be saved. Please try again.')
      setError(message)
      // Re-fetch so the newer text replaces this version; the resident reviews and agrees again.
      if (response.status === 409) { setAgreed(false); await onAccepted(null) }
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop consent-backdrop" role="presentation">
      <div className="profile-modal terms-modal consent-modal" role="alertdialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-summary">
        <div className="modal-heading"><div><p className="eyebrow">{workspace.businessName}</p><h2 id="consent-title">We have updated our policies</h2></div><span className="settings-section-icon"><FileCheck2 size={18} /></span></div>
        <p id="consent-summary" className="consent-summary">Please read the updated {names} and accept to continue using the portal.</p>
        <div className="consent-policies">
          {consent.changed.map((field, index) => (
            <details key={field} open={index === 0}>
              <summary>{titles[field]}</summary>
              <p className="terms-text">{workspace[field]}</p>
            </details>
          ))}
        </div>
        <label className="consent-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> I have read and agree to the updated {names}.</label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button><button type="button" className="primary-button" disabled={!agreed || isSaving} onClick={accept}>{isSaving ? 'Saving…' : 'Accept and continue'}</button></div>
      </div>
    </div>
  )
}
