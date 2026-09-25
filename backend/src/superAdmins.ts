import { Prisma, type SuperAdmin } from '@prisma/client'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { createTemporaryPassword, hashPassword, isAcceptablePassword, passwordRequirement } from './credentials.js'
import { prisma } from './db.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Super admin fields that are safe to return to clients (never the password hash). */
export type PublicSuperAdmin = Pick<SuperAdmin, 'id' | 'name' | 'email' | 'createdAt'>

/** Result of {@link createSuperAdmin}; carries an HTTP status so routes can relay failures as-is. */
export type CreateSuperAdminResult = { ok: true; admin: PublicSuperAdmin } | { ok: false; status: 400 | 409; error: string }

/** Emails are stored lower-cased so login and uniqueness are case-insensitive. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/** Strips a super admin record down to its client-safe fields. */
export function toPublicSuperAdmin({ id, name, email, createdAt }: SuperAdmin): PublicSuperAdmin {
  return { id, name, email, createdAt }
}

/** Validates and stores a new super admin; shared by the API and the bootstrap script. */
export async function createSuperAdmin(input: { name?: string; email?: string; password?: string }): Promise<CreateSuperAdminResult> {
  const name = input.name?.trim()
  const email = input.email ? normalizeEmail(input.email) : ''
  if (!name) return { ok: false, status: 400, error: 'Name is required.' }
  if (!emailPattern.test(email)) return { ok: false, status: 400, error: 'A valid email address is required.' }
  if (!isAcceptablePassword(input.password)) return { ok: false, status: 400, error: passwordRequirement }
  try {
    const admin = await prisma.superAdmin.create({ data: { name, email, passwordHash: hashPassword(input.password) } })
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
    const result = await createSuperAdmin(request.body as { name?: string; email?: string; password?: string })
    if (!result.ok) { response.status(result.status).json({ error: result.error }); return }
    response.status(201).json(result.admin)
  } catch (error) {
    console.error('Super admin creation failed:', error)
    response.status(503).json({ error: 'Super admin could not be saved.' })
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
