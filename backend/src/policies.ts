import type { WorkspaceSettings } from '@prisma/client'
import { defaultPrivacyPolicy, defaultTerms } from './defaultPolicies.js'

/**
 * Resident policies (terms and privacy). Each has a version timestamp that moves only when the
 * owner saves genuinely different, non-empty text; residents must accept the latest version.
 */
export const policyFields = {
  termsAndConditions: { label: 'Terms and conditions', updatedAt: 'termsUpdatedAt' },
  privacyPolicy: { label: 'Privacy policy', updatedAt: 'privacyPolicyUpdatedAt' },
} as const
export type PolicyField = keyof typeof policyFields
const fields = Object.keys(policyFields) as PolicyField[]

export const policyMaxLength = 5000

/** The policies residents see: the owner's saved text, or the starter draft if they never saved any. */
export const policiesOf = (settings: WorkspaceSettings): Record<PolicyField, string> => ({ termsAndConditions: settings.termsAndConditions ?? defaultTerms, privacyPolicy: settings.privacyPolicy ?? defaultPrivacyPolicy })

/**
 * Version stamps for a save. Unchanged text, and clearing a policy (which hides it), do not ask
 * residents to re-accept anything.
 */
export function policyVersionChanges(next: Partial<Record<PolicyField, string>>, current: WorkspaceSettings, now = new Date()) {
  const previous = policiesOf(current)
  return Object.fromEntries(fields.filter((field) => next[field] && next[field] !== previous[field]).map((field) => [policyFields[field].updatedAt, now])) as Partial<Pick<WorkspaceSettings, 'termsUpdatedAt' | 'privacyPolicyUpdatedAt'>>
}

/**
 * What a resident still has to accept: the visible policies updated after the version they last
 * accepted, and that latest version (sent back on accept so nobody consents to unseen text).
 * Null when nothing is pending, including before the owner has ever changed a policy.
 */
export function pendingPolicyConsent(settings: WorkspaceSettings, acceptedVersion: Date | null) {
  const texts = policiesOf(settings)
  const changed = fields.filter((field) => {
    const updated = settings[policyFields[field].updatedAt]
    return Boolean(texts[field]) && updated !== null && (!acceptedVersion || updated > acceptedVersion)
  })
  if (!changed.length) return null
  const version = new Date(Math.max(...changed.map((field) => (settings[policyFields[field].updatedAt] as Date).getTime())))
  return { version: version.toISOString(), changed }
}
