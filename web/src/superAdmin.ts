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
  aadharNumber: string | null
  sex: Sex | null
  /** ISO 3166-1 alpha-2 code, e.g. "IN". */
  nationality: string | null
  permanentAddress: string | null
  createdAt: string
}

/** Reads the API's `{ error }` body, falling back when the response has none. */
export async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string }
  return body.error ?? fallback
}
