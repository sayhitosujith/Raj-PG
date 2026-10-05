import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { SessionResponse } from './session'
import { readApiError } from './superAdmin'

/** A saved passkey as the resident sees it: which device, when it was added and last used. */
export type Passkey = { id: string; label: string; createdAt: string; lastUsedAt: string | null }

/**
 * Whether this device can sign in with its own Face ID, Touch ID or fingerprint (a built-in
 * authenticator), as opposed to only a separate security key. False on browsers without passkeys.
 */
export async function canUseDeviceUnlock() {
  if (!browserSupportsWebAuthn()) return false
  return platformAuthenticatorIsAvailable().catch(() => false)
}

const postJson = (url: string, body?: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })

// The phone's own prompt was cancelled or timed out: not an error worth a red message.
const isCancelled = (error: unknown) => error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')

/** Signs in with a passkey on this device. Returns the session, null when the resident cancelled, or throws with a message to show. */
export async function signInWithPasskey(): Promise<SessionResponse | null> {
  const start = await postJson('/api/resident-portal/passkey-login/options')
  if (!start.ok) throw new Error(await readApiError(start, 'Face ID / fingerprint sign-in is not available right now.'))
  const { options, challengeId } = await start.json()
  let credential
  try {
    credential = await startAuthentication({ optionsJSON: options })
  } catch (error) {
    if (isCancelled(error)) return null
    throw new Error('Your phone could not use Face ID or fingerprint here. Sign in with your password instead.')
  }
  const finish = await postJson('/api/resident-portal/passkey-login', { challengeId, credential })
  if (!finish.ok) throw new Error(await readApiError(finish, 'Face ID / fingerprint sign-in did not work.'))
  return await finish.json() as SessionResponse
}

/** Saves a passkey on this device for the signed-in resident. Returns their passkeys, null when cancelled, or throws with a message. */
export async function addPasskey(): Promise<Passkey[] | null> {
  const start = await postJson('/api/resident-portal/passkeys/options')
  if (!start.ok) throw new Error(await readApiError(start, 'Face ID / fingerprint sign-in could not be set up.'))
  const { options, challengeId } = await start.json()
  let credential
  try {
    credential = await startRegistration({ optionsJSON: options })
  } catch (error) {
    if (isCancelled(error)) return null
    // InvalidStateError: this phone already holds a passkey for this account.
    if (error instanceof Error && error.name === 'InvalidStateError') throw new Error('Face ID / fingerprint sign-in is already on for this phone.')
    throw new Error('Your phone could not set up Face ID or fingerprint sign-in.')
  }
  const finish = await postJson('/api/resident-portal/passkeys', { challengeId, credential })
  if (!finish.ok) throw new Error(await readApiError(finish, 'Face ID / fingerprint sign-in could not be saved.'))
  return await finish.json() as Passkey[]
}
