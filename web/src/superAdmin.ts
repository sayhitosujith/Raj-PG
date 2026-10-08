/** Sex as the API stores it. */
export type Sex = 'MALE' | 'FEMALE' | 'OTHER'

/** Display labels for {@link Sex}, in the order the form offers them. */
export const sexLabels: Record<Sex, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' }

/**
 * A super admin as returned by the API (never includes credentials). Identity details are null for
 * admins created before they were collected, or by the bootstrap script.
 */
export type SuperAdmin = {
  id: string
  name: string
  email: string
  phone: string | null
  /** One ID document by nationality: Aadhaar for Indian nationals, passport for everyone else. */
  aadharNumber: string | null
  passportNumber: string | null
  sex: Sex | null
  /** ISO 3166-1 alpha-2 code, e.g. "IN". */
  nationality: string | null
  permanentAddress: string | null
  /** SUPER_ADMIN: everything. RECEPTIONIST: day-to-day work for the properties in propertyIds only. */
  staffRole: StaffRole
  propertyIds: string[]
  createdAt: string
}

export type StaffRole = 'SUPER_ADMIN' | 'RECEPTIONIST'

/** Whether this staff member is a super admin (the owner), who sees every page and property. */
export const isSuperAdmin = (admin: Pick<SuperAdmin, 'staffRole'>) => admin.staffRole !== 'RECEPTIONIST'

/** Form field names of the identity details, matching the API's body keys. */
export const identityFieldNames = ['phone', 'aadharNumber', 'passportNumber', 'sex', 'nationality', 'permanentAddress'] as const

/** The identity details from a form containing {@link identityFieldNames} inputs, as API body fields. */
export function readIdentityFields(form: FormData): Record<string, string> {
  return Object.fromEntries(identityFieldNames.map((field) => [field, String(form.get(field) ?? '')]))
}

/** Reads the API's `{ error }` body, falling back when the response has none. */
export async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string }
  return body.error ?? fallback
}
