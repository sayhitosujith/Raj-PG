import { Prisma, Sex, type SuperAdmin, StaffRole } from '@prisma/client'
import { Router } from 'express'
import { isValidAadharNumber } from './aadhar.js'
import type { AuthContext } from './auth.js'
import { createTemporaryPassword, hashPassword, isAcceptablePassword, passwordRequirement } from './credentials.js'
import { isCountryCode } from './countries.js'
import { findDuplicate } from './duplicates.js'
import { prisma } from './db.js'
import { isValidEmail, normalizePhone, phoneRequirement } from './validation.js'
import { indianNationality, passportNumberPattern } from './identityDocuments.js'


/**
 * Super admin fields that are safe to return to clients (never the password hash). The full Aadhaar
 * number is included because only super admins can call these routes and they can edit it; the
 * list view masks it.
 */
export type PublicSuperAdmin = Pick<SuperAdmin, 'id' | 'name' | 'email' | 'phone' | 'aadharNumber' | 'passportNumber' | 'sex' | 'nationality' | 'permanentAddress' | 'staffRole' | 'propertyIds' | 'createdAt'>

/** Result of {@link createSuperAdmin}; carries an HTTP status so routes can relay failures as-is. */
export type CreateSuperAdminResult = { ok: true; admin: PublicSuperAdmin } | { ok: false; status: 400 | 409; error: string }

/** Identity details every admin added from the dashboard must provide. */
export type SuperAdminIdentity = Pick<Prisma.SuperAdminCreateInput, 'phone' | 'aadharNumber' | 'passportNumber' | 'sex' | 'nationality' | 'permanentAddress'>

/** The identity fields as they arrive in a request body, before validation. */
export type IdentityInput = { phone?: string; aadharNumber?: string; passportNumber?: string; sex?: string; nationality?: string; permanentAddress?: string }

/**
 * Validates and normalises the identity fields of a new super admin, all of which are required. The
 * ID document follows nationality, as for residents: a 12-digit Aadhaar number for Indian nationals,
 * a passport number for everyone else; the other one is cleared so only the matching ID is kept.
 */
export function parseSuperAdminIdentity(input: IdentityInput): { ok: true; identity: SuperAdminIdentity } | { ok: false; error: string } {
  const phone = normalizePhone(input.phone ?? '')
  const nationality = input.nationality?.trim().toUpperCase() ?? ''
  const aadharNumber = input.aadharNumber?.replace(/\s/g, '') ?? ''
  const passportNumber = input.passportNumber?.replace(/\s/g, '').toUpperCase() ?? ''
  const permanentAddress = input.permanentAddress?.trim()
  if (!phone) return { ok: false, error: phoneRequirement }
  if (!isCountryCode(nationality)) return { ok: false, error: 'Choose a nationality from the list.' }
  const isIndianNational = nationality === indianNationality
  if (isIndianNational && !isValidAadharNumber(aadharNumber)) return { ok: false, error: 'Aadhaar number must be 12 digits.' }
  if (!isIndianNational && !passportNumberPattern.test(passportNumber)) return { ok: false, error: 'Passport number must be 6 to 9 letters and digits.' }
  if (!Object.values(Sex).includes(input.sex as Sex)) return { ok: false, error: 'Choose male, female, or other for sex.' }
  if (!permanentAddress) return { ok: false, error: 'Permanent address is required.' }
  const document = isIndianNational ? { aadharNumber, passportNumber: null } : { aadharNumber: null, passportNumber }
  return { ok: true, identity: { phone, ...document, sex: input.sex as Sex, nationality, permanentAddress } }
}

/** Emails are stored lower-cased so login and uniqueness are case-insensitive. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/** Strips a super admin record down to its client-safe fields. */
export function toPublicSuperAdmin({ id, name, email, phone, aadharNumber, passportNumber, sex, nationality, permanentAddress, staffRole, propertyIds, createdAt }: SuperAdmin): PublicSuperAdmin {
  return { id, name, email, phone, aadharNumber, passportNumber, sex, nationality, permanentAddress, staffRole, propertyIds, createdAt }
}

/** A staff member's role and, for receptionists, the properties they manage. */
export type StaffRoleInput = { staffRole: StaffRole; propertyIds: string[] }

/**
 * Reads the role and assigned properties from a request body. Receptionists need at least one existing
 * property; super admins reach everything, so any list sent for them is dropped. Absent role = no change.
 */
export async function parseStaffRole(body: { staffRole?: unknown; propertyIds?: unknown }): Promise<{ ok: true; value: StaffRoleInput | null } | { ok: false; error: string }> {
  if (body.staffRole === undefined) return { ok: true, value: null }
  if (body.staffRole !== StaffRole.SUPER_ADMIN && body.staffRole !== StaffRole.RECEPTIONIST) return { ok: false, error: 'Role must be Super admin or Receptionist.' }
  if (body.staffRole === StaffRole.SUPER_ADMIN) return { ok: true, value: { staffRole: StaffRole.SUPER_ADMIN, propertyIds: [] } }
  const ids = Array.isArray(body.propertyIds) ? [...new Set(body.propertyIds.filter((id): id is string => typeof id === 'string' && id.length > 0))] : []
  if (!ids.length) return { ok: false, error: 'Choose at least one property for this receptionist.' }
  const found = await prisma.property.count({ where: { id: { in: ids } } })
  if (found !== ids.length) return { ok: false, error: 'One of the chosen properties no longer exists.' }
  return { ok: true, value: { staffRole: StaffRole.RECEPTIONIST, propertyIds: ids } }
}

/**
 * Validates and stores a new super admin; shared by the API and the bootstrap script. The script
 * has no identity details to give, so `identity` is optional here and enforced by the route instead.
 */
export async function createSuperAdmin(input: { name?: string; email?: string; password?: string }, identity: SuperAdminIdentity = {}, role: StaffRoleInput | null = null): Promise<CreateSuperAdminResult> {
  const name = input.name?.trim()
  const email = input.email ? normalizeEmail(input.email) : ''
  if (!name) return { ok: false, status: 400, error: 'Name is required.' }
  if (!isValidEmail(email)) return { ok: false, status: 400, error: 'A valid email address is required.' }
  if (!isAcceptablePassword(input.password)) return { ok: false, status: 400, error: passwordRequirement }
  const duplicate = await findDuplicate(prisma, { email, aadharNumber: identity.aadharNumber, passportNumber: identity.passportNumber })
  if (duplicate) return { ok: false, status: 409, error: duplicate }
  try {
    const admin = await prisma.superAdmin.create({ data: { ...identity, ...(role ?? {}), name, email, passwordHash: hashPassword(input.password) } })
    return { ok: true, admin: toPublicSuperAdmin(admin) }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { ok: false, status: 409, error: 'A super admin with this email already exists.' }
    throw error
  }
}

/**
 * Sets a super admin's password (the caller's choice, already validated with
 * {@link isAcceptablePassword}, or a random one when omitted) and revokes their sessions, except
 * `keepSessionId` so an admin resetting their own password stays signed in.
 */
export async function resetSuperAdminPassword(where: Prisma.SuperAdminWhereUniqueInput, options: { password?: string; keepSessionId?: string } = {}) {
  const { keepSessionId } = options
  const password = options.password ?? createTemporaryPassword()
  const admin = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.superAdmin.update({ where, data: { passwordHash: hashPassword(password) } })
    await transaction.session.deleteMany({ where: { superAdminId: updated.id, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } })
    return updated
  })
  return { admin: toPublicSuperAdmin(admin), password }
}

/** Super admin management routes; must be mounted behind the super admin guard. */
export const superAdminRouter = Router()

superAdminRouter.get('/super-admins', async (_request, response) => {
  const admins = await prisma.superAdmin.findMany({ orderBy: { createdAt: 'asc' } })
  response.json(admins.map(toPublicSuperAdmin))
})

superAdminRouter.post('/super-admins', async (request, response) => {
  try {
    const body = request.body as { name?: string; email?: string; password?: string; staffRole?: unknown; propertyIds?: unknown } & IdentityInput
    const parsed = parseSuperAdminIdentity(body)
    if (!parsed.ok) { response.status(400).json({ error: parsed.error }); return }
    const role = await parseStaffRole(body)
    if (!role.ok) { response.status(400).json({ error: role.error }); return }
    const result = await createSuperAdmin(body, parsed.identity, role.value)
    if (!result.ok) { response.status(result.status).json({ error: result.error }); return }
    response.status(201).json(result.admin)
  } catch (error) {
    console.error('Super admin creation failed:', error)
    response.status(503).json({ error: 'Super admin could not be saved.' })
  }
})

// Edits another admin's name, email and identity details. An admin's own email is refused here: it
// is a sign-in credential, and Settings → My account asks for the current password before changing it.
superAdminRouter.patch('/super-admins/:id', async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const body = request.body as { name?: string; email?: string; staffRole?: unknown; propertyIds?: unknown } & IdentityInput
  const name = body.name?.trim()
  const email = normalizeEmail(body.email ?? '')
  if (!name || name.length > 60) { response.status(400).json({ error: 'Name is required (up to 60 characters).' }); return }
  if (!isValidEmail(email)) { response.status(400).json({ error: 'A valid email address is required.' }); return }
  const parsed = parseSuperAdminIdentity(body)
  if (!parsed.ok) { response.status(400).json({ error: parsed.error }); return }
  try {
    const role = await parseStaffRole(body)
    if (!role.ok) { response.status(400).json({ error: role.error }); return }
    if (request.params.id === userId) {
      const self = await prisma.superAdmin.findUniqueOrThrow({ where: { id: userId }, select: { email: true, staffRole: true } })
      if (self.email !== email) { response.status(403).json({ error: 'Change your own email under Settings → My account; it needs your current password.' }); return }
      // Only super admins reach this route, so refusing a change to your own role always leaves one.
      if (role.value && role.value.staffRole !== self.staffRole) { response.status(403).json({ error: 'You cannot change your own role.' }); return }
    }
    const duplicate = await findDuplicate(prisma, { email, aadharNumber: parsed.identity.aadharNumber, passportNumber: parsed.identity.passportNumber }, { superAdminId: request.params.id })
    if (duplicate) { response.status(409).json({ error: duplicate }); return }
    const admin = await prisma.superAdmin.update({ where: { id: request.params.id }, data: { ...parsed.identity, ...(role.value ?? {}), name, email } })
    response.json(toPublicSuperAdmin(admin))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Super admin was not found.' }); return }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { response.status(409).json({ error: 'Another super admin already uses that email.' }); return }
    console.error('Super admin update failed:', error)
    response.status(503).json({ error: 'Details could not be saved.' })
  }
})

// Removes another admin; their sessions go with them (cascade), so they are signed out at once.
// Deleting yourself is refused, which also guarantees at least one admin always remains.
superAdminRouter.delete('/super-admins/:id', async (request, response) => {
  const { userId } = response.locals.auth as AuthContext
  if (request.params.id === userId) { response.status(403).json({ error: 'You cannot delete your own account.' }); return }
  try {
    await prisma.superAdmin.delete({ where: { id: request.params.id } })
    response.status(204).send()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Super admin was not found.' }); return }
    console.error('Super admin deletion failed:', error)
    response.status(503).json({ error: 'Super admin could not be deleted.' })
  }
})

superAdminRouter.post('/super-admins/:id/reset-password', async (request, response) => {
  const { sessionId } = response.locals.auth as AuthContext
  const { password } = request.body as { password?: string }
  if (!isAcceptablePassword(password)) { response.status(400).json({ error: passwordRequirement }); return }
  try {
    await resetSuperAdminPassword({ id: request.params.id }, { password, keepSessionId: sessionId })
    response.status(204).send()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Super admin was not found.' }); return }
    console.error('Password reset failed:', error)
    response.status(503).json({ error: 'Password could not be reset.' })
  }
})
