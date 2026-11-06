import { readApiError } from './superAdmin'

/** The resident a super admin is acting as, shown in the act-as banner. */
export type ActingResident = { id: string; name: string }

/**
 * Starts acting as a resident. The server sets a cookie that lets this super admin's own session
 * through the resident portal's routes as that resident (backend/src/actAs.ts), and records it in the
 * audit log. Resolves to the resident, or to an error message.
 */
export async function startActingAs(residentId: string): Promise<ActingResident | string> {
  const response = await fetch('/api/act-as/resident', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ residentId }) }).catch(() => null)
  if (!response) return 'Could not reach the server.'
  if (!response.ok) return readApiError(response, 'Could not open that resident\'s view.')
  return (await response.json() as { resident: ActingResident }).resident
}

/** Stops acting as a resident. Failures are ignored: the cookie also ends with the browser session. */
export async function stopActingAs() {
  await fetch('/api/act-as/resident', { method: 'DELETE' }).catch(() => undefined)
}
