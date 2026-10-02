import { matchesAccessKey, verifyPassword } from './credentials.js'
import { prisma } from './db.js'
import { normalizePhone, phoneDigitVariants } from './validation.js'

// Emails and phones are not unique across residents, so a handful of candidates are checked
// rather than trusting the first match.
const maxCandidates = 5
async function findCandidateIds(identifier: string) {
  if (identifier.includes('@')) {
    const byEmail = await prisma.resident.findMany({ where: { active: true, email: { equals: identifier, mode: 'insensitive' } }, select: { id: true }, take: maxCandidates })
    return byEmail.map(({ id }) => id)
  }
  // Normalising makes "+91 98765 43210", "09876543210" and "9876543210" the same number; a
  // foreign number must be typed with its country code.
  const phone = normalizePhone(identifier)
  if (!phone) return []
  const [digits, legacyDigits] = phoneDigitVariants(phone)
  const byPhone = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Resident"
    WHERE "active" AND regexp_replace(coalesce("phone", ''), '\\D', '', 'g') IN (${digits}, ${legacyDigits})
    LIMIT ${maxCandidates}`
  return byPhone.map(({ id }) => id)
}

/**
 * Resolves an active resident from email/phone plus a secret. Until the resident has a password
 * the secret is their access key; afterwards only the password is accepted, so a handed-over
 * access key cannot be reused once the account has a password.
 */
/**
 * True when the email or phone belongs to an active resident with no password and no access key,
 * i.e. their sign-in was cleared (after an overdue-rent lockout) and the owner must issue a new key.
 */
export async function isAwaitingNewAccessKey(identifier: string) {
  const ids = await findCandidateIds(identifier.trim())
  return ids.length > 0 && await prisma.resident.count({ where: { id: { in: ids }, passwordHash: null, accessKeyHash: null } }) > 0
}

export async function findResidentByCredentials(identifier: string, secret: string) {
  const ids = await findCandidateIds(identifier.trim())
  if (!ids.length) return null
  for (const resident of await prisma.resident.findMany({ where: { id: { in: ids } } })) {
    // Access keys are always generated upper-case and are often retyped or pasted with stray
    // whitespace, so they are normalised; passwords are compared exactly as typed.
    if (resident.passwordHash ? verifyPassword(secret, resident.passwordHash) : Boolean(resident.accessKeyHash && matchesAccessKey(secret.trim().toUpperCase(), resident.accessKeyHash))) {
      return { resident, mustSetPassword: !resident.passwordHash }
    }
  }
  return null
}
