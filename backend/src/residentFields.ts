import { isValidEmail, normalizePhone, phoneRequirement } from './validation.js'

/**
 * The resident's plain contact fields, shared by the owner's resident form and the resident's own
 * "My details" form so both trim, normalise and reject input the same way.
 */
export const textFields = ['name', 'phone', 'email', 'permanentAddress'] as const

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
  return data
}

/** Why picked text fields are invalid, or null. A blank email is allowed (it is optional). */
export function findInvalidField(data: Partial<Record<TextField, string>>) {
  if (data.name !== undefined && !data.name) return 'Name is required.'
  if (data.phone === invalidPhone) return phoneRequirement
  if (data.email && !isValidEmail(data.email)) return 'Enter a valid email address.'
  return null
}
