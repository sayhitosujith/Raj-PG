import type { Prisma } from '@prisma/client'
import { phoneDigitVariants } from './validation.js'

/**
 * Duplicate checks for the details that identify a person. Emails must be unique across every
 * account (resident or super admin), because one sign-in form serves both and a shared email
 * signs in whichever account's password matches. Phones must be unique among residents, who also
 * sign in by phone; Aadhaar and passport numbers across residents and super admins. Only active
 * residents count: an inactive one cannot sign in, and a returning
 * resident can be added again without deleting their old record.
 *
 * These are application checks, not database constraints (a rule spanning two tables cannot be a
 * unique index), so two saves racing each other could still both pass; at this app's volume that
 * is an acceptable trade-off.
 */

/** The identifying details of an account being saved; blank or absent ones are not checked. */
export type IdentityCandidate = { email?: string | null; phone?: string | null; aadharNumber?: string | null; passportNumber?: string | null }

/** The account being saved, so it never clashes with itself. */
export type SelfReference = { residentId?: string; superAdminId?: string }

type Owner = { name: string; kind: 'resident' | 'super admin' }

async function findOwner(db: Prisma.TransactionClient, candidate: IdentityCandidate, self: SelfReference): Promise<{ detail: string; owner: Owner } | null> {
  const residents = { active: true, ...(self.residentId ? { id: { not: self.residentId } } : {}) } satisfies Prisma.ResidentWhereInput
  const admins = (self.superAdminId ? { id: { not: self.superAdminId } } : {}) satisfies Prisma.SuperAdminWhereInput
  const email = candidate.email?.trim()
  if (email) {
    const [admin, resident] = await Promise.all([
      db.superAdmin.findFirst({ where: { ...admins, email: { equals: email, mode: 'insensitive' } }, select: { name: true } }),
      db.resident.findFirst({ where: { ...residents, email: { equals: email, mode: 'insensitive' } }, select: { name: true } }),
    ])
    if (admin) return { detail: 'email', owner: { name: admin.name, kind: 'super admin' } }
    if (resident) return { detail: 'email', owner: { name: resident.name, kind: 'resident' } }
  }
  if (candidate.phone) {
    const [digits, legacyDigits] = phoneDigitVariants(candidate.phone)
    const [resident] = await db.$queryRaw<Array<{ name: string }>>`
      SELECT "name" FROM "Resident"
      WHERE "active" AND "id" <> ${self.residentId ?? ''} AND regexp_replace(coalesce("phone", ''), '\\D', '', 'g') IN (${digits}, ${legacyDigits})
      LIMIT 1`
    if (resident) return { detail: 'phone number', owner: { name: resident.name, kind: 'resident' } }
  }
  if (candidate.aadharNumber) {
    const [admin, resident] = await Promise.all([
      db.superAdmin.findFirst({ where: { ...admins, aadharNumber: candidate.aadharNumber }, select: { name: true } }),
      db.resident.findFirst({ where: { ...residents, aadharNumber: candidate.aadharNumber }, select: { name: true } }),
    ])
    if (admin) return { detail: 'Aadhaar number', owner: { name: admin.name, kind: 'super admin' } }
    if (resident) return { detail: 'Aadhaar number', owner: { name: resident.name, kind: 'resident' } }
  }
  if (candidate.passportNumber) {
    const [admin, resident] = await Promise.all([
      db.superAdmin.findFirst({ where: { ...admins, passportNumber: candidate.passportNumber }, select: { name: true } }),
      db.resident.findFirst({ where: { ...residents, passportNumber: candidate.passportNumber }, select: { name: true } }),
    ])
    if (admin) return { detail: 'passport number', owner: { name: admin.name, kind: 'super admin' } }
    if (resident) return { detail: 'passport number', owner: { name: resident.name, kind: 'resident' } }
  }
  return null
}

/**
 * Why the details clash with another account, or null when they are all free. Super admins are
 * told whose account it is so they can fix it; `revealOwner: false` keeps other people's names
 * from a resident checking their own submission.
 */
export async function findDuplicate(db: Prisma.TransactionClient, candidate: IdentityCandidate, self: SelfReference = {}, { revealOwner = true } = {}) {
  const clash = await findOwner(db, candidate, self)
  if (!clash) return null
  return revealOwner
    ? `This ${clash.detail} is already used by ${clash.owner.kind} "${clash.owner.name}".`
    : `This ${clash.detail} is already registered to another account. Contact your property owner if it is yours.`
}
