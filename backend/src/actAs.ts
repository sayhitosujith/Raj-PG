import { StaffRole } from '@prisma/client'
import { Router, type Request, type Response } from 'express'
import { prisma } from './db.js'
import { requireOwner } from './staffAccess.js'

/**
 * Super admins acting as a resident ("View as resident"). Starting it sets a cookie naming the
 * resident; while it is set, the owner's own session passes the resident routes' guard as that
 * resident (see requireRole in auth.ts), so the real resident portal loads and works unchanged.
 * The owner's session is never swapped out, so the dashboard keeps working and stopping is just
 * clearing the cookie. Every write made while acting is put in the audit log under the owner's
 * name, so it is never mistaken for something the resident did.
 */

const actAsCookieName = 'raj_pg_act_as'

/** The resident a super admin session is acting as, from the act-as cookie, if any. */
export function readActingResidentId(request: Request) {
  for (const pair of request.headers.cookie?.split(';') ?? []) {
    const [name, ...value] = pair.trim().split('=')
    if (name === actAsCookieName) return decodeURIComponent(value.join('=')) || undefined
  }
  return undefined
}

/** Ends acting as a resident; also called on logout so the next sign-in starts clean. */
export function clearActAs(response: Response) {
  response.clearCookie(actAsCookieName, { path: '/' })
}

/** Whether this staff member may act as a resident: super admins only, never receptionists. */
export async function canActAsResident(superAdminId: string) {
  const staff = await prisma.superAdmin.findUnique({ where: { id: superAdminId }, select: { staffRole: true } })
  return staff?.staffRole === StaffRole.SUPER_ADMIN
}

/**
 * Logs a successful write a super admin made while acting as a resident. Resident routes have no
 * plain-words descriptions like the dashboard's (staffActivity.ts), so the entry names the route.
 */
export function recordActingWrite(request: Request, response: Response, staffId: string, residentId: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const route = `${request.method} ${request.originalUrl.split('?')[0].replace(/^\/api/, '')}`
  response.on('finish', () => {
    if (response.statusCode >= 400) return
    void (async () => {
      const [staff, resident] = await Promise.all([
        prisma.superAdmin.findUnique({ where: { id: staffId }, select: { name: true } }),
        prisma.resident.findUnique({ where: { id: residentId }, select: { name: true, room: { select: { property: { select: { id: true, name: true } } } } } }),
      ])
      const property = resident?.room?.property
      await prisma.staffActivity.create({ data: { staffId, staffName: staff?.name ?? 'A team member', staffRole: StaffRole.SUPER_ADMIN, action: `Acting as resident ${resident?.name ?? 'unknown'}: ${route}`, propertyId: property?.id ?? null, propertyName: property?.name ?? null } })
    })().catch((error) => console.error('Recording act-as activity failed:', error))
  })
}

/** Start and stop acting as a resident. Mounted behind the super admin guard and the audit log. */
export const actAsRouter = Router()

actAsRouter.post('/act-as/resident', requireOwner, async (request, response) => {
  const { residentId } = request.body as { residentId?: unknown }
  if (typeof residentId !== 'string' || !residentId) { response.status(400).json({ error: 'Choose a resident.' }); return }
  const resident = await prisma.resident.findFirst({ where: { id: residentId, deletedAt: null }, select: { id: true, name: true } })
  if (!resident) { response.status(404).json({ error: 'That resident no longer exists.' }); return }
  // Session-only (no maxAge): closing the browser ends acting, like the dashboard's in-memory preview.
  response.cookie(actAsCookieName, resident.id, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' })
  response.json({ resident })
})

actAsRouter.delete('/act-as/resident', (_request, response) => {
  clearActAs(response)
  response.status(204).send()
})
