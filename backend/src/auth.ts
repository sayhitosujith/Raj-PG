import { createHash, randomBytes } from 'node:crypto'
import { UserRole } from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { verifyPassword } from './credentials.js'
import { prisma } from './db.js'
import { findResidentByCredentials } from './residentCredentials.js'
import { normalizeEmail, toPublicSuperAdmin } from './superAdmins.js'

const sessionCookieName = 'raj_pg_session'
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000

/** The authenticated caller, exposed on `response.locals.auth` by {@link requireRole}. */
export type AuthContext = { role: UserRole; userId: string; sessionId: string }

// Session tokens are 256 random bits, so an unsalted SHA-256 is enough to make a leaked
// sessions table useless without the slow hashing that passwords need.
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Creates a session for either user type and sets it as an httpOnly cookie for the web app.
 * The token is also returned so the mobile app can send it as a bearer header instead.
 */
export async function startSession(response: Response, role: UserRole, subject: { superAdminId: string } | { residentId: string }) {
  const token = randomBytes(32).toString('base64url')
  await prisma.session.create({ data: { tokenHash: hashToken(token), role, ...subject, expiresAt: new Date(Date.now() + sessionLifetimeMs) } })
  response.cookie(sessionCookieName, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: sessionLifetimeMs, path: '/' })
  return token
}

function readSessionToken(request: Request) {
  const bearer = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
  if (bearer) return bearer
  for (const pair of request.headers.cookie?.split(';') ?? []) {
    const [name, ...value] = pair.trim().split('=')
    if (name === sessionCookieName) return decodeURIComponent(value.join('='))
  }
  return undefined
}

async function findLiveSession(request: Request) {
  const token = readSessionToken(request)
  if (!token) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })
  return session && session.expiresAt > new Date() ? session : null
}

/** Rejects the request unless it carries a live session of the given user type. */
export function requireRole(role: UserRole) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!process.env.DATABASE_URL) { response.status(503).json({ error: 'Sign-in requires a database connection.' }); return }
    try {
      const session = await findLiveSession(request)
      if (!session) { response.status(401).json({ error: 'Sign in required.' }); return }
      if (session.role !== role) { response.status(403).json({ error: 'You do not have access to this resource.' }); return }
      const auth: AuthContext = { role, userId: session.superAdminId ?? session.residentId ?? '', sessionId: session.id }
      response.locals.auth = auth
      next()
    } catch (error) {
      console.error('Session lookup failed:', error)
      response.status(503).json({ error: 'Sign-in is temporarily unavailable.' })
    }
  }
}

/** Login, logout, and current-session routes shared by both user types; mounted before any guard. */
export const authRouter = Router()

// One form for both user types: the account type is discovered from the credentials rather than
// chosen up front. Super admins are checked first; they only have emails, so a phone number
// goes straight to the resident check. The response matches GET /auth/session.
authRouter.post('/auth/login', async (request, response) => {
  // `email` is still accepted for callers written before residents shared this endpoint.
  const { identifier: rawIdentifier, email, password } = request.body as { identifier?: string; email?: string; password?: string }
  const identifier = (rawIdentifier ?? email)?.trim()
  if (!identifier || !password) { response.status(400).json({ error: 'Email or phone and password are required.' }); return }
  if (!process.env.DATABASE_URL) { response.status(503).json({ error: 'Sign-in requires a database connection.' }); return }
  try {
    const admin = identifier.includes('@') ? await prisma.superAdmin.findUnique({ where: { email: normalizeEmail(identifier) } }) : null
    if (admin && verifyPassword(password, admin.passwordHash)) {
      await startSession(response, UserRole.SUPER_ADMIN, { superAdminId: admin.id })
      response.json({ role: UserRole.SUPER_ADMIN, admin: toPublicSuperAdmin(admin) })
      return
    }
    const match = await findResidentByCredentials(identifier, password)
    if (match) {
      await startSession(response, UserRole.RESIDENT, { residentId: match.resident.id })
      response.json({ role: UserRole.RESIDENT })
      return
    }
    response.status(401).json({ error: 'Invalid email, phone, or password.' })
  } catch (error) {
    console.error('Login failed:', error)
    response.status(503).json({ error: 'Sign-in is temporarily unavailable.' })
  }
})

authRouter.post('/auth/logout', async (request, response) => {
  const token = readSessionToken(request)
  if (token && process.env.DATABASE_URL) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => undefined)
  response.clearCookie(sessionCookieName, { path: '/' })
  response.status(204).send()
})

// Lets the web app decide which experience to render without knowing the user type up front.
authRouter.get('/auth/session', async (request, response) => {
  if (!process.env.DATABASE_URL) { response.status(503).json({ error: 'Sign-in requires a database connection.' }); return }
  try {
    const session = await findLiveSession(request)
    if (session?.superAdminId) {
      const admin = await prisma.superAdmin.findUnique({ where: { id: session.superAdminId } })
      if (admin) { response.json({ role: UserRole.SUPER_ADMIN, admin: toPublicSuperAdmin(admin) }); return }
    }
    if (session?.residentId) { response.json({ role: UserRole.RESIDENT }); return }
    response.status(401).json({ error: 'Sign in required.' })
  } catch (error) {
    console.error('Session lookup failed:', error)
    response.status(503).json({ error: 'Sign-in is temporarily unavailable.' })
  }
})

authRouter.get('/auth/me', requireRole(UserRole.SUPER_ADMIN), async (_request, response) => {
  const { userId } = response.locals.auth as AuthContext
  const admin = await prisma.superAdmin.findUnique({ where: { id: userId } })
  if (!admin) { response.status(401).json({ error: 'Sign in required.' }); return }
  response.json({ admin: toPublicSuperAdmin(admin) })
})
