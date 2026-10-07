/**
 * Identity documents behind resident verification, mirroring the server: Indian nationals are
 * verified on Aadhaar, everyone else on passport and Indian visa.
 */

export const indianNationality = 'IN'

/** Whether a nationality (ISO 3166-1 alpha-2) is verified on Aadhaar rather than passport. */
export const isIndian = (nationality: string | null | undefined) => (nationality ?? indianNationality) === indianNationality

/** The document a resident is verified on, for labels ("Aadhaar pending review"). */
export const identityDocumentName = (nationality: string | null | undefined) => (isIndian(nationality) ? 'Aadhaar' : 'Passport')

/** Visa categories, in the order the form offers them; keys match the server's list. */
export const visaTypeLabels: Record<string, string> = {
  TOURIST: 'Tourist', E_TOURIST: 'e-Tourist', BUSINESS: 'Business', E_BUSINESS: 'e-Business', EMPLOYMENT: 'Employment',
  STUDENT: 'Student', E_STUDENT: 'e-Student', MEDICAL: 'Medical', E_MEDICAL: 'e-Medical', CONFERENCE: 'Conference',
  RESEARCH: 'Research', JOURNALIST: 'Journalist', ENTRY: 'Entry (X)', TRANSIT: 'Transit', OCI: 'OCI card (no visa needed)', OTHER: 'Other',
}

/** Form field names of the identity text inputs, matching the API's body keys. */
export const identityFieldNames = ['nationality', 'aadharNumber', 'passportNumber', 'passportExpiry', 'visaNumber', 'visaType', 'visaExpiry'] as const

/** The identity inputs present in a form, as API body fields; absent ones come back blank, which the server ignores. */
export function readIdentityFields(form: FormData): Record<string, string> {
  return Object.fromEntries(identityFieldNames.map((field) => [field, String(form.get(field) ?? '')]))
}

/** Uploaded documents waiting to be sent with a form; only chosen files are present. */
export type DocumentUploads = { aadharCardUrl?: string; passportScanUrl?: string }

/** The identity details a resident record carries, for completeness checks and display. */
export type IdentityDetails = { nationality?: string | null; aadharNumber?: string | null; passportNumber?: string | null; passportExpiry?: string | null; visaNumber?: string | null; visaType?: string | null; visaExpiry?: string | null; hasAadharCard: boolean; hasPassportScan: boolean }

/** Whether an owner could approve: every detail of the resident's document set and its upload are on file. */
export function hasCompleteIdentity(details: IdentityDetails) {
  return isIndian(details.nationality)
    ? Boolean(details.aadharNumber) && details.hasAadharCard
    : Boolean(details.passportNumber && details.passportExpiry && details.visaNumber && details.visaType && details.visaExpiry) && details.hasPassportScan
}

/** Whether any detail of the resident's document set has been entered, to tell "incomplete" from "not started". */
export function hasAnyIdentity(details: IdentityDetails) {
  return isIndian(details.nationality)
    ? Boolean(details.aadharNumber) || details.hasAadharCard
    : Boolean(details.passportNumber || details.visaNumber) || details.hasPassportScan
}

/** A visa for display: "V1234567 · Employment", just the number when no type is set, or "—". */
export function visaText({ visaNumber, visaType }: { visaNumber?: string | null; visaType?: string | null }) {
  if (!visaNumber) return '—'
  return visaType ? `${visaNumber} · ${visaTypeLabels[visaType] ?? visaType}` : visaNumber
}

/** Whether a stored date-only value ("YYYY-MM-DD…") is today or earlier in the viewer's calendar. */
export function isOnOrBeforeToday(value: string) {
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return value.slice(0, 10) <= todayKey
}
