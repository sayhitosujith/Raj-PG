import { isValidEmail, normalizePhone, phoneRequirement } from './validation.js'

/**
 * The resident's plain contact fields, shared by the owner's resident form and the resident's own
 * "My details" form so both trim, normalise and reject input the same way. The emergency contact,
 * vehicle and occupation are optional throughout; a blank value clears them.
 */
export const textFields = ['name', 'phone', 'email', 'permanentAddress', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone', 'vehicleType', 'vehicleNumber', 'occupation'] as const

/** The relationships the forms offer for the emergency contact (web/src/EmergencyContact.tsx lists the same). */
export const emergencyContactRelations = ['Father', 'Mother', 'Spouse', 'Sister', 'Legal guardian'] as const

/** The vehicle types the forms offer (web/src/VehicleFields.tsx lists the same). */
export const vehicleTypes = ['Bike', 'Scooter', 'Car', 'Bicycle'] as const

// Registration numbers vary by state and era (KA 01 AB 1234, 22 BH 1234 AA), so only the characters
// and length are checked; spaces are kept as typed, collapsed to one.
const vehicleNumberPattern = /^[A-Z0-9][A-Z0-9 -]{2,14}$/

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
  if (data.vehicleNumber) data.vehicleNumber = data.vehicleNumber.toUpperCase().replace(/\s+/g, ' ')
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
  if (data.vehicleType && !(vehicleTypes as readonly string[]).includes(data.vehicleType)) return `Vehicle type must be one of: ${vehicleTypes.join(', ')}.`
  if (data.vehicleNumber && !vehicleNumberPattern.test(data.vehicleNumber)) return 'Enter the vehicle number as on its number plate, e.g. KA 01 AB 1234.'
  if (data.occupation && data.occupation.length > 60) return 'Keep the occupation under 60 characters.'
  // A number with no type is ambiguous; a bicycle may have no number, so only this way round.
  if (data.vehicleNumber && data.vehicleType === '') return 'Choose the vehicle type for that number.'
  return null
}

// Optional fields stored as null when blank.
const optionalFields = ['emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone', 'vehicleType', 'vehicleNumber', 'occupation'] as const
type OptionalField = (typeof optionalFields)[number]

/**
 * `data` ready to write: a blank emergency-contact or vehicle field is stored as null rather than '',
 * so "none" has one representation. Fields that were not sent stay absent and are left unchanged.
 */
export function toResidentWrite(data: Partial<Record<TextField, string>>) {
  // Only these optional fields may become null; name and the rest keep their string type for Prisma.
  const write: Omit<typeof data, OptionalField> & Partial<Record<OptionalField, string | null>> = { ...data }
  for (const field of optionalFields) if (write[field] === '') write[field] = null
  return write
}
