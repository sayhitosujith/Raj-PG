import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

const accessKeyPattern = /^RAJ-[0-9A-F]{8}$/

function equalHex(expectedHex: string, actual: Buffer) {
  const expected = Buffer.from(expectedHex, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Generates a 6-digit door lock PIN; leading zeros kept, since keypads accept them. */
export function createDoorAccessKey() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/** Generates a resident access key in the only format the API accepts. */
export function createAccessKey() {
  return `RAJ-${randomBytes(4).toString('hex').toUpperCase()}`
}

/**
 * Clients may echo back a key previewed via GET /api/residents/access-key, but only in the exact
 * generated shape, so owners cannot hand-pick weak keys.
 */
export function isValidAccessKey(accessKey: string) {
  return accessKeyPattern.test(accessKey)
}

/** Hashes an access key for storage; only the hash is ever persisted. */
export function hashAccessKey(accessKey: string) {
  return scryptSync(accessKey, process.env.ACCESS_KEY_SALT ?? 'raj-pg-local-salt', 32).toString('hex')
}

/** Constant-time comparison of a supplied access key against a stored hash. */
export function matchesAccessKey(accessKey: string, storedHash: string) {
  return equalHex(storedHash, Buffer.from(hashAccessKey(accessKey), 'hex'))
}

const minimumPasswordLength = 10

/** Error shown when a password fails {@link isAcceptablePassword}. */
export const passwordRequirement = `Password must be at least ${minimumPasswordLength} characters.`

/** One password rule for every account type (super admins and residents). */
export function isAcceptablePassword(password: string | undefined): password is string {
  return (password?.length ?? 0) >= minimumPasswordLength
}

/** Generates a 16-character random password (96 bits) for resets; shown to the caller once. */
export function createTemporaryPassword() {
  return randomBytes(12).toString('base64url')
}

/** Hashes a password with its own random salt, stored together as `salt:hash`. */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

/** Constant-time check of a password against a value produced by {@link hashPassword}. */
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  return equalHex(hash, scryptSync(password, salt, hash.length / 2))
}
