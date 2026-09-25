/** A super admin as returned by the API (never includes credentials). */
export type SuperAdmin = { id: string; name: string; email: string; createdAt: string }

/** Reads the API's `{ error }` body, falling back when the response has none. */
export async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string }
  return body.error ?? fallback
}
