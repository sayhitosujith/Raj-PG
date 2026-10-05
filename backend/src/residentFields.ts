import { isValidEmail, normalizePhone, phoneRequirement } from './validation.js'

/**
 * The resident's plain contact fields, shared by the owner's resident form and the resident's own
 * "My details" form so both trim, normalise and reject input the same way. The emergency contact is
 * optional throughout; a blank value clears it.
 */
export const textFields = ['name', 'phone', 'email', 'permanentAddress', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone'] as const

/** The relationships the forms offer for the emergency contact (web/src/EmergencyContact.tsx lists the same). */
export const emergencyContactRelations = ['Father', 'Mother', 'Spouse', 'Sister', 'Legal guardian'] as const

/** One of the resident's plain contact fields. */
export type TextField = (typeof textFields)[number]

// Never a real number (E.164 always starts with "+"), so it cannot collide with valid input.
const invalidPhone = 'invalid'

/** The text fields present in `body`, trimmed; only fields sent are returned, so updates can be partial. */
export function pickTextFields(body: Partial<Record<TextField, unknown>>) {
  const data: Partial<Record<TextField, string>> = {}
  for (const field of textFields) {
    const value = body[field]
    if (typeof value === 'string') data[field] = value.trim()
  }
  // Stored in E.164 form when valid; an invalid number is marked for findInvalidField to reject.
  if (data.phone) data.phone = normalizePhone(data.phone) ?? invalidPhone
  if (data.emergencyContactPhone) data.emergencyContactPhone = normalizePhone(data.emergencyContactPhone) ?? invalidPhone
  return data
}

/** Why picked text fields are invalid, or null. A blank email is allowed (it is optional). */
export function findInvalidField(data: Partial<Record<TextField, string>>) {
  if (data.name !== undefined && !data.name) return 'Name is required.'
  if (data.phone === invalidPhone) return phoneRequirement
  if (data.email && !isValidEmail(data.email)) return 'Enter a valid email address.'
  if (data.emergencyContactPhone === invalidPhone) return `Emergency contact: ${phoneRequirement.charAt(0).toLowerCase()}${phoneRequirement.slice(1)}`
  if (data.emergencyContactRelation && !(emergencyContactRelations as readonly string[]).includes(data.emergencyContactRelation)) return `Emergency contact relationship must be one of: ${emergencyContactRelations.join(', ')}.`
  // A name or relationship with no number gives the owner nobody to call.
  if ((data.emergencyContactName || data.emergencyContactRelation) && data.emergencyContactPhone === '') return 'Add a phone number for the emergency contact, or clear its name and relationship.'
  return null
}

const emergencyFields = ['emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone'] as const
type EmergencyField = (typeof emergencyFields)[number]

/**
 * `data` ready to write: a blank emergency-contact field is stored as null rather than '', so "no
 * contact" has one representation. Fields that were not sent stay absent and are left unchanged.
 */
export function toResidentWrite(data: Partial<Record<TextField, string>>) {
  // Only the emergency fields may become null; name and the rest keep their string type for Prisma.
  const write: Omit<typeof data, EmergencyField> & Partial<Record<EmergencyField, string | null>> = { ...data }
  for (const field of emergencyFields) if (write[field] === '') write[field] = null
  return write
}
