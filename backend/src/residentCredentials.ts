import { matchesAccessKey, verifyPassword } from './credentials.js'
import { prisma } from './db.js'

// Emails and phones are not unique across residents, so a handful of candidates are checked
// rather than trusting the first match.
const maxCandidates = 5
// Indian mobile numbers are 10 digits; comparing the last 10 digits makes "+91 98765 43210",
// "09876543210" and "9876543210" the same number, however the owner typed it in.
const significantPhoneDigits = 10

async function findCandidateIds(identifier: string) {
  if (identifier.includes('@')) {
    const byEmail = await prisma.resident.findMany({ where: { active: true, email: { equals: identifier, mode: 'insensitive' } }, select: { id: true }, take: maxCandidates })
    return byEmail.map(({ id }) => id)
  }
  const digits = identifier.replace(/\D/g, '')
  if (digits.length < significantPhoneDigits) return []
  const byPhone = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Resident"
    WHERE "active" AND right(regexp_replace(coalesce("phone", ''), '\\D', '', 'g'), ${significantPhoneDigits}::int) = ${digits.slice(-significantPhoneDigits)}
    LIMIT ${maxCandidates}`
  return byPhone.map(({ id }) => id)
}

/**
 * Resolves an active resident from email/phone plus a secret. Until the resident has a password
 * the secret is their access key; afterwards only the password is accepted, so a handed-over
 * access key cannot be reused once the account has a password.
 */
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
