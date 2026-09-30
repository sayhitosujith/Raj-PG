import { Prisma, Sex, type SuperAdmin } from '@prisma/client'
import { Router } from 'express'
import { isValidAadharNumber } from './aadhar.js'
import type { AuthContext } from './auth.js'
import { createTemporaryPassword, hashPassword, isAcceptablePassword, passwordRequirement } from './credentials.js'
import { isCountryCode } from './countries.js'
import { prisma } from './db.js'
import { isValidEmail, normalizePhone } from './validation.js'


/**
 * Super admin fields that are safe to return to clients (never the password hash). The full Aadhaar
 * number is included because only super admins can call these routes and they can edit it; the
 * list view masks it.
 */
export type PublicSuperAdmin = Pick<SuperAdmin, 'id' | 'name' | 'email' | 'phone' | 'aadharNumber' | 'sex' | 'nationality' | 'permanentAddress' | 'createdAt'>

/** Result of {@link createSuperAdmin}; carries an HTTP status so routes can relay failures as-is. */
export type CreateSuperAdminResult = { ok: true; admin: PublicSuperAdmin } | { ok: false; status: 400 | 409; error: string }

/** Identity details every admin added from the dashboard must provide. */
export type SuperAdminIdentity = Pick<Prisma.SuperAdminCreateInput, 'phone' | 'aadharNumber' | 'sex' | 'nationality' | 'permanentAddress'>

type IdentityInput = { phone?: string; aadharNumber?: string; sex?: string; nationality?: string; permanentAddress?: string }

/** Validates and normalises the identity fields of a new super admin, all of which are required. */
export function parseSuperAdminIdentity(input: IdentityInput): { ok: true; identity: SuperAdminIdentity } | { ok: false; error: string } {
  const phone = normalizePhone(input.phone ?? '')
  const aadharNumber = input.aadharNumber?.replace(/\s/g, '') ?? ''
  const nationality = input.nationality?.trim().toUpperCase() ?? ''
  const permanentAddress = input.permanentAddress?.trim()
  if (!phone) return { ok: false, error: 'Phone number must be 10 digits.' }
  if (!isValidAadharNumber(aadharNumber)) return { ok: false, error: 'Aadhaar number must be 12 digits.' }
  if (!Object.values(Sex).includes(input.sex as Sex)) return { ok: false, error: 'Choose male, female, or other for sex.' }
  if (!isCountryCode(nationality)) return { ok: false, error: 'Choose a nationality from the list.' }
  if (!permanentAddress) return { ok: false, error: 'Permanent address is required.' }
  return { ok: true, identity: { phone, aadharNumber, sex: input.sex as Sex, nationality, permanentAddress } }
}

/** Emails are stored lower-cased so login and uniqueness are case-insensitive. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/** Strips a super admin record down to its client-safe fields. */
export function toPublicSuperAdmin({ id, name, email, phone, aadharNumber, sex, nationality, permanentAddress, createdAt }: SuperAdmin): PublicSuperAdmin {
  return { id, name, email, phone, aadharNumber, sex, nationality, permanentAddress, createdAt }
}

/**
 * Validates and stores a new super admin; shared by the API and the bootstrap script. The script
 * has no identity details to give, so `identity` is optional here and enforced by the route instead.
 */
export async function createSuperAdmin(input: { name?: string; email?: string; password?: string }, identity: SuperAdminIdentity = {}): Promise<CreateSuperAdminResult> {
  const name = input.name?.trim()
  const email = input.email ? normalizeEmail(input.email) : ''
  if (!name) return { ok: false, status: 400, error: 'Name is required.' }
  if (!isValidEmail(email)) return { ok: false, status: 400, error: 'A valid email address is required.' }
  if (!isAcceptablePassword(input.password)) return { ok: false, status: 400, error: passwordRequirement }
  try {
    const admin = await prisma.superAdmin.create({ data: { ...identity, name, email, passwordHash: hashPassword(input.password) } })
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
    const body = request.body as { name?: string; email?: string; password?: string } & IdentityInput
    const parsed = parseSuperAdminIdentity(body)
    if (!parsed.ok) { response.status(400).json({ error: parsed.error }); return }
    const result = await createSuperAdmin(body, parsed.identity)
    if (!result.ok) { response.status(result.status).json({ error: result.error }); return }
    response.status(201).json(result.admin)
  } catch (error) {
    console.error('Super admin creation failed:', error)
    response.status(503).json({ error: 'Super admin could not be saved.' })
  }
})

superAdminRouter.patch('/super-admins/:id', async (request, response) => {
  const parsed = parseSuperAdminIdentity(request.body as IdentityInput)
  if (!parsed.ok) { response.status(400).json({ error: parsed.error }); return }
  try {
    const admin = await prisma.superAdmin.update({ where: { id: request.params.id }, data: parsed.identity })
    response.json(toPublicSuperAdmin(admin))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Super admin was not found.' }); return }
    console.error('Super admin update failed:', error)
    response.status(503).json({ error: 'Details could not be saved.' })
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
