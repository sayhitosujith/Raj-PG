import { isValidAadharNumber } from './aadhar.js'
import { isCountryCode } from './countries.js'
import { parseDateOnly, propertyNow } from './dates.js'

/**
 * Identity documents behind resident verification. Indian nationals are verified on their
 * Aadhaar (number + card); everyone else on their passport (number, expiry, scan of the photo
 * page) and Indian visa (number, type, expiry), the details Form C reporting to the FRRO needs.
 * A resident holds one set or the other, never both.
 */

export const indianNationality = 'IN'

/** Whether a nationality (ISO 3166-1 alpha-2) is Indian, and so verified on Aadhaar. */
export const isIndian = (nationality: string) => nationality === indianNationality

/** Visa categories an owner can record; OCI covers Overseas Citizens of India, who need no visa. */
export const visaTypes = ['TOURIST', 'E_TOURIST', 'BUSINESS', 'E_BUSINESS', 'EMPLOYMENT', 'STUDENT', 'E_STUDENT', 'MEDICAL', 'E_MEDICAL', 'CONFERENCE', 'RESEARCH', 'JOURNALIST', 'ENTRY', 'TRANSIT', 'OCI', 'OTHER'] as const

/** Uploads are stored as data URLs; only these document types are accepted and served. */
export const documentDataUrlPattern = /^data:(image\/jpeg|image\/png|application\/pdf);base64,(.+)$/s

const maxDocumentBytes = 2_000_000
// ICAO 9303 allows up to 9 characters; 6 covers the shortest numbers still in circulation.
/** A passport number as stored: 6–9 letters and digits, upper case. */
export const passportNumberPattern = /^[A-Z0-9]{6,9}$/
// Visa sticker numbers and e-Visa application IDs vary by issue; letters and digits only.
const visaNumberPattern = /^[A-Z0-9]{4,20}$/

/** Why an uploaded document is unacceptable, or null when it is fine. */
export function findDocumentProblem(dataUrl: string, documentName: string) {
  const match = dataUrl.match(documentDataUrlPattern)
  if (!match) return `${documentName} must be a JPG, PNG, or PDF.`
  // Base64 encodes 3 bytes in 4 characters, so the decoded size can be checked without decoding.
  if (Math.floor(match[2].length * 3 / 4) > maxDocumentBytes) return `${documentName} must be smaller than 2 MB.`
  return null
}

/** Identity fields as they arrive in a request body, before validation. */
export type IdentityInput = Partial<Record<'nationality' | 'aadharNumber' | 'aadharCardUrl' | 'passportNumber' | 'passportExpiry' | 'passportScanUrl' | 'visaNumber' | 'visaType' | 'visaExpiry', unknown>>

/** Validated, normalised identity fields; only those present in the input are set. */
export type IdentityFields = Partial<{ nationality: string; aadharNumber: string; aadharCardUrl: string; passportNumber: string; passportExpiry: Date; passportScanUrl: string; visaNumber: string; visaType: string; visaExpiry: Date }>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined)
const compact = (value: unknown) => text(value)?.replace(/\s/g, '').toUpperCase()

/**
 * Validates whichever identity fields are present (blank ones are ignored), so it serves both
 * partial owner edits and a resident's full submission. Expiry dates are checked separately by
 * {@link findExpiredDocument}, which needs the values already on file.
 */
export function parseIdentityFields(input: IdentityInput): { ok: true; fields: IdentityFields } | { ok: false; error: string } {
  const fields: IdentityFields = {}
  const nationality = compact(input.nationality)
  if (nationality) {
    if (!isCountryCode(nationality)) return { ok: false, error: 'Choose a nationality from the list.' }
    fields.nationality = nationality
  }
  const aadharNumber = compact(input.aadharNumber)
  if (aadharNumber) {
    if (!isValidAadharNumber(aadharNumber)) return { ok: false, error: 'Aadhaar number must be 12 digits.' }
    fields.aadharNumber = aadharNumber
  }
  const passportNumber = compact(input.passportNumber)
  if (passportNumber) {
    if (!passportNumberPattern.test(passportNumber)) return { ok: false, error: 'Passport number must be 6 to 9 letters or digits.' }
    fields.passportNumber = passportNumber
  }
  const visaNumber = compact(input.visaNumber)
  if (visaNumber) {
    if (!visaNumberPattern.test(visaNumber)) return { ok: false, error: 'Visa number must be 4 to 20 letters or digits.' }
    fields.visaNumber = visaNumber
  }
  const visaType = compact(input.visaType)
  if (visaType) {
    if (!(visaTypes as readonly string[]).includes(visaType)) return { ok: false, error: 'Choose a visa type from the list.' }
    fields.visaType = visaType
  }
  for (const [key, name] of [['passportExpiry', 'Passport expiry'], ['visaExpiry', 'Visa expiry']] as const) {
    const date = parseDateOnly(text(input[key]))
    if (date === null) return { ok: false, error: `${name} must be a valid date.` }
    if (date) fields[key] = date
  }
  for (const [key, name] of [['aadharCardUrl', 'Aadhaar card'], ['passportScanUrl', 'Passport scan']] as const) {
    const dataUrl = text(input[key])
    if (!dataUrl) continue
    const problem = findDocumentProblem(dataUrl, name)
    if (problem) return { ok: false, error: problem }
    fields[key] = dataUrl
  }
  return { ok: true, fields }
}

const dayOf = (date: Date) => date.toISOString().slice(0, 10)

/**
 * An error when a newly entered expiry date is today or earlier. Dates unchanged from `current`
 * are not re-checked, so a document that has since expired never blocks unrelated edits.
 */
export function findExpiredDocument(fields: IdentityFields, current: { passportExpiry?: Date | null; visaExpiry?: Date | null } = {}) {
  const today = propertyNow().date
  const isNewAndExpired = (date: Date | undefined, stored: Date | null | undefined) => date && (!stored || dayOf(stored) !== dayOf(date)) && dayOf(date) <= today
  if (isNewAndExpired(fields.passportExpiry, current.passportExpiry)) return 'This passport has expired. Enter a passport that is valid beyond today.'
  if (isNewAndExpired(fields.visaExpiry, current.visaExpiry)) return 'This visa has expired. Enter a visa that is valid beyond today.'
  return null
}

const clearedAadhar = { aadharNumber: null, aadharCardUrl: null }
const clearedForeignDocuments = { passportNumber: null, passportExpiry: null, passportScanUrl: null, visaNumber: null, visaType: null, visaExpiry: null }

/**
 * The document columns to write for a resident of `nationality`: the provided fields of their own
 * document set, and the other set cleared so details that no longer apply are not kept.
 */
export function identityWrite(nationality: string, fields: IdentityFields) {
  // Absent fields stay undefined, which Prisma treats as "leave unchanged".
  const { aadharNumber, aadharCardUrl, passportNumber, passportExpiry, passportScanUrl, visaNumber, visaType, visaExpiry } = fields
  return isIndian(nationality)
    ? { ...clearedForeignDocuments, aadharNumber, aadharCardUrl }
    : { ...clearedAadhar, passportNumber, passportExpiry, passportScanUrl, visaNumber, visaType, visaExpiry }
}

/** What an owner checks before approving: every detail of the resident's document set, plus its upload. */
export type IdentityOnFile = { nationality: string; aadharNumber?: string | null; passportNumber?: string | null; passportExpiry?: Date | null; visaNumber?: string | null; visaType?: string | null; visaExpiry?: Date | null; hasAadharCard: boolean; hasPassportScan: boolean }

/** An owner can only verify what they can see, so every detail and the upload must be on file. */
export function hasCompleteIdentity(record: IdentityOnFile) {
  return isIndian(record.nationality)
    ? Boolean(record.aadharNumber) && record.hasAadharCard
    : Boolean(record.passportNumber && record.passportExpiry && record.visaNumber && record.visaType && record.visaExpiry) && record.hasPassportScan
}

/** The document a resident is verified on, for messages ("Aadhaar", "Passport"). */
export const identityDocumentName = (nationality: string) => (isIndian(nationality) ? 'Aadhaar' : 'Passport')
