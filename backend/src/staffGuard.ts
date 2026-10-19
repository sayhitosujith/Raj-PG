import type { NextFunction, Request, Response } from 'express'
import { prisma } from './db.js'
import { canReachProperty, staffAccess } from './staffAccess.js'

/**
 * The receptionist role's limits, applied in one place before every staff route (mounted right after the
 * staff sign-in check), so no individual route can forget them:
 *  1. owner-only routes refuse receptionists (team, settings changes, website text, WhatsApp/email setup, finance,
 *     approving new residents and verifying ID documents,
 *     adding/editing/deleting properties, rooms and property staff, deleted records, deleting residents, door access keys);
 *  2. routes about one record (a resident, payment, booking, request…) or one property check that it
 *     belongs to one of the receptionist's properties; unknown or unreachable records answer 404;
 *  3. a property named in a request body must be one of theirs.
 * Lists filter themselves with the helpers in staffAccess.ts. Super admins pass straight through.
 */

type Rule = { method?: string; path: RegExp }

// Paths are relative to the /api mount.
const ownerOnly: Rule[] = [
  { path: /^\/super-admins(\/|$)/ },
  { path: /^\/subscriptions(\/|$)/ },
  { path: /^\/staff-activity$/ },
  { path: /^\/audit-logs$/ },
  { method: 'PUT', path: /^\/settings$/ },
  { path: /^\/settings\/.+/ },
  { path: /^\/site-content(\/banner)?$/ },
  { path: /^\/whatsapp(\/|$)/ },
  { path: /^\/email(\/|$)/ },
  { path: /^\/finance(\/|$)/ },
  { path: /^\/expenses(\/|$)/ },
  { method: 'POST', path: /^\/properties$/ },
  { method: 'PUT', path: /^\/properties\/[^/]+$/ },
  { method: 'DELETE', path: /^\/properties\/[^/]+$/ },
  { method: 'POST', path: /^\/properties\/[^/]+\/rooms$/ },
  { method: 'PATCH', path: /^\/properties\/[^/]+\/rooms\/[^/]+$/ },
  { method: 'DELETE', path: /^\/properties\/[^/]+\/rooms\/[^/]+$/ },
  { path: /^\/residents\/deleted$/ },
  { method: 'DELETE', path: /^\/residents\/[^/]+$/ },
  { method: 'DELETE', path: /^\/residents\/[^/]+\/record$/ },
  { path: /^\/residents\/[^/]+\/deletion\/decision$/ },
  { path: /^\/residents\/[^/]+\/approval$/ },
  { path: /^\/residents\/[^/]+\/aadhar-verification$/ },
  { path: /^\/residents\/[^/]+\/door-key$/ },
  { path: /^\/properties\/[^/]+\/workers(\/|$)/ },
]

// Where the property of a record reached by id comes from. Residents belong to one through their room.
const viaResident = (residentId: string) => prisma.resident.findUnique({ where: { id: residentId }, select: { room: { select: { propertyId: true } } } }).then((resident) => resident?.room?.propertyId)
const recordLookups: Array<{ path: RegExp; propertyOf: (id: string) => Promise<string | null | undefined> }> = [
  { path: /^\/properties\/([^/]+)/, propertyOf: async (id) => id },
  { path: /^\/residents\/(?!deleted$|access-key$)([^/]+)/, propertyOf: viaResident },
  { path: /^\/payments\/([^/]+)/, propertyOf: (id) => prisma.payment.findUnique({ where: { id }, select: { propertyId: true } }).then((row) => row?.propertyId) },
  { path: /^\/bookings\/([^/]+)/, propertyOf: (id) => prisma.booking.findUnique({ where: { id }, select: { propertyId: true } }).then((row) => row?.propertyId) },
  { path: /^\/announcements\/([^/]+)/, propertyOf: (id) => prisma.announcement.findUnique({ where: { id }, select: { propertyId: true } }).then((row) => row?.propertyId) },
  { path: /^\/maintenance\/([^/]+)/, propertyOf: (id) => prisma.maintenanceRequest.findUnique({ where: { id }, select: { propertyId: true } }).then((row) => row?.propertyId) },
  { path: /^\/fire-alerts\/([^/]+)/, propertyOf: (id) => prisma.fireAlert.findUnique({ where: { id }, select: { propertyId: true } }).then((row) => row?.propertyId) },
  { path: /^\/housekeeping\/([^/]+)/, propertyOf: (id) => prisma.housekeepingRequest.findUnique({ where: { id }, select: { residentId: true } }).then((row) => row ? viaResident(row.residentId) : null) },
]

/**
 * The property a staff request is about: the record in its path (resident, payment, request…), or a
 * propertyId in its body; null when it is not about one property (settings, the team). Shared with the
 * audit log, which shows it on each entry.
 */
export async function requestPropertyId(path: string, body: unknown) {
  for (const { path: pattern, propertyOf } of recordLookups) {
    const id = path.match(pattern)?.[1]
    if (id) return (await propertyOf(decodeURIComponent(id))) ?? null
  }
  const fromBody = (body as { propertyId?: unknown } | undefined)?.propertyId
  return typeof fromBody === 'string' && fromBody ? fromBody : null
}

export async function staffGuard(request: Request, response: Response, next: NextFunction) {
  const access = staffAccess(response)
  if (access.isOwner) { next(); return }
  const { method, path } = request
  try {
    if (ownerOnly.some((rule) => (!rule.method || rule.method === method) && rule.path.test(path))) {
      response.status(403).json({ error: 'Only a super admin can do this.' })
      return
    }
    for (const { path: pattern, propertyOf } of recordLookups) {
      const id = path.match(pattern)?.[1]
      if (!id) continue
      if (!canReachProperty(access, await propertyOf(decodeURIComponent(id)))) { response.status(404).json({ error: 'That was not found.' }); return }
      break
    }
    const bodyProperty = (request.body as { propertyId?: unknown } | undefined)?.propertyId
    if (typeof bodyProperty === 'string' && bodyProperty && !canReachProperty(access, bodyProperty)) {
      response.status(403).json({ error: 'That property is not one of yours.' })
      return
    }
    next()
  } catch (error) {
    console.error('Staff access check failed:', error)
    response.status(503).json({ error: 'Could not check your access.' })
  }
}
