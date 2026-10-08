import { Router, type NextFunction, type Request, type Response } from 'express'
import type { AuthContext } from './auth.js'
import { prisma } from './db.js'
import { staffAccess } from './staffAccess.js'
import { requestPropertyId } from './staffGuard.js'

/**
 * The audit log: each successful write any staff member makes is recorded in plain words ("Added
 * resident Ravi", "Updated the weekly menu for Premium Stay") with who made it and their role. Super
 * admins read it all on the Audit logs page; receptionists' entries also go to the super admins'
 * notifications. Mounted after the staff guards, so only allowed writes that succeeded are logged.
 * The words are worked out before the change runs, so deleted records are still named.
 */

type Describe = (body: Record<string, unknown>, ids: string[]) => Promise<string> | string

const residentName = async (id: string) => (await prisma.resident.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'a resident'
const propertyName = async (id: string) => (await prisma.property.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'a property'
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

// [method, path pattern (relative to /api, capturing ids), description]. First match wins.
const actions: Array<[string, RegExp, Describe]> = [
  ['POST', /^\/residents$/, (body) => `Added resident ${text(body.name) ?? ''} (waiting for your approval)`.replace('  ', ' ')],
  ['PUT', /^\/residents\/([^/]+)$/, async (_body, [id]) => `Updated ${await residentName(id)}'s details`],
  ['POST', /^\/residents\/([^/]+)\/rent-payments$/, async (body, [id]) => `Recorded rent for ${await residentName(id)}${text(body.month) ? ` (${text(body.month)})` : ''}`],
  ['DELETE', /^\/residents\/([^/]+)\/rent-payments\/[^/]+$/, async (_body, [id]) => `Undid a rent payment for ${await residentName(id)}`],
  ['POST', /^\/residents\/([^/]+)\/exit\/(decision|date|complete)$/, async (body, [id, step]) => `${step === 'complete' ? 'Completed' : step === 'date' ? 'Changed the date of' : body.approve === false ? 'Declined' : 'Approved'} ${await residentName(id)}'s move-out`],
  ['POST', /^\/residents\/([^/]+)\/(access-key|password)$/, async (_body, [id]) => `Reset ${await residentName(id)}'s sign-in`],
  ['DELETE', /^\/residents\/([^/]+)\/food-request$/, async (_body, [id]) => `Declined ${await residentName(id)}'s food request`],
  ['POST', /^\/residents\/([^/]+)\/concessions\/[^/]+\/cancel$/, async (_body, [id]) => `Cancelled a rent concession for ${await residentName(id)}`],
  ['POST', /^\/residents\/([^/]+)\/approval$/, async (body, [id]) => `${body.approve === false ? 'Rejected' : 'Approved'} new resident ${await residentName(id)}`],
  ['POST', /^\/residents\/([^/]+)\/aadhar-verification$/, async (body, [id]) => `${text(body.decision) === 'approve' ? 'Verified' : 'Rejected'} ${await residentName(id)}'s ID document`],
  ['POST', /^\/residents\/([^/]+)\/deletion\/decision$/, async (body, [id]) => `${body.approve === false ? 'Declined' : 'Approved'} ${await residentName(id)}'s account deletion`],
  ['DELETE', /^\/residents\/([^/]+)$/, async (_body, [id]) => `Deleted resident ${await residentName(id)}`],
  ['POST', /^\/properties$/, (body) => `Added property ${text(body.name) ?? ''}`.trim()],
  ['PUT', /^\/properties\/([^/]+)$/, async (_body, [id]) => `Updated property ${await propertyName(id)}`],
  ['DELETE', /^\/properties\/([^/]+)$/, async (_body, [id]) => `Deleted property ${await propertyName(id)}`],
  ['POST', /^\/properties\/([^/]+)\/rooms$/, async (_body, [id]) => `Added rooms to ${await propertyName(id)}`],
  ['DELETE', /^\/properties\/([^/]+)\/rooms\/[^/]+$/, async (_body, [id]) => `Removed a room from ${await propertyName(id)}`],
  ['PUT', /^\/settings$/, (body) => `Changed settings (${Object.keys(body).slice(0, 4).join(', ')}${Object.keys(body).length > 4 ? '…' : ''})`],
  ['PUT', /^\/settings\/(logo|upi-qr)$/, (_body, [kind]) => kind === 'logo' ? 'Uploaded a new logo' : 'Uploaded a UPI QR image'],
  ['DELETE', /^\/settings\/(logo|upi-qr)$/, (_body, [kind]) => kind === 'logo' ? 'Removed the logo' : 'Removed the UPI QR image'],
  ['POST', /^\/super-admins$/, (body) => `Added team member ${text(body.name) ?? ''} as ${body.staffRole === 'RECEPTIONIST' ? 'receptionist' : 'super admin'}`],
  ['PATCH', /^\/super-admins\/([^/]+)$/, (body) => `Updated team member ${text(body.name) ?? ''}`.trim()],
  ['DELETE', /^\/super-admins\/([^/]+)$/, async (_body, [id]) => `Removed team member ${(await prisma.superAdmin.findUnique({ where: { id }, select: { name: true } }))?.name ?? ''}`.trim()],
  ['POST', /^\/super-admins\/([^/]+)\/reset-password$/, async (_body, [id]) => `Reset the password of ${(await prisma.superAdmin.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'a team member'}`],
  ['POST', /^\/expenses$/, (body) => `Added an expense${text(body.description) ? `: ${text(body.description)}` : ''}`],
  ['DELETE', /^\/expenses\/[^/]+$/, () => 'Deleted an expense'],
  ['POST', /^\/whatsapp\/test$/, () => 'Sent a test WhatsApp message'],
  ['POST', /^\/whatsapp\/run-rent-reminders$/, () => 'Ran the rent reminders'],
  ['POST', /^\/email\/test$/, () => 'Sent a test email'],
  ['POST', /^\/payments$/, () => 'Added a payment'],
  ['PUT', /^\/payments\/[^/]+$/, () => 'Updated a payment'],
  ['DELETE', /^\/payments\/[^/]+$/, () => 'Deleted a payment'],
  ['POST', /^\/bookings$/, () => 'Added a referral request'],
  ['PUT', /^\/bookings\/[^/]+$/, () => 'Updated a referral request'],
  ['DELETE', /^\/bookings\/[^/]+$/, () => 'Deleted a referral request'],
  ['POST', /^\/announcements$/, (body) => `Posted an announcement${text(body.title) ? `: ${text(body.title)}` : ''}`],
  ['PUT', /^\/announcements\/[^/]+$/, (body) => `Edited an announcement${text(body.title) ? `: ${text(body.title)}` : ''}`],
  ['DELETE', /^\/announcements\/[^/]+$/, () => 'Deleted an announcement'],
  ['PATCH', /^\/housekeeping\/[^/]+$/, (body) => `Updated a housekeeping request${text(body.status) ? ` (${text(body.status)!.toLowerCase()})` : ''}`],
  ['PUT', /^\/properties\/([^/]+)\/housekeeping-staff$/, async (_body, [id]) => `Updated housekeeping staff for ${await propertyName(id)}`],
  ['PATCH', /^\/maintenance\/[^/]+$/, (body) => `Updated a repair request${text(body.status) ? ` (${text(body.status)})` : ''}`],
  ['PUT', /^\/properties\/([^/]+)\/menu$/, async (_body, [id]) => `Updated the weekly menu for ${await propertyName(id)}`],
  ['POST', /^\/fire-alerts$/, () => 'Raised a fire alarm'],
  ['POST', /^\/fire-alerts\/[^/]+\/clear$/, () => 'Cleared a fire alarm'],
  ['POST', /^\/properties\/([^/]+)\/photos$/, async (_body, [id]) => `Added a photo of ${await propertyName(id)}`],
  ['PATCH', /^\/properties\/([^/]+)\/photos\/[^/]+$/, async (_body, [id]) => `Changed a photo caption for ${await propertyName(id)}`],
  ['DELETE', /^\/properties\/([^/]+)\/photos\/[^/]+$/, async (_body, [id]) => `Removed a photo of ${await propertyName(id)}`],
]

async function describe(method: string, path: string, body: Record<string, unknown>) {
  for (const [verb, pattern, words] of actions) {
    if (verb !== method) continue
    const match = path.match(pattern)
    if (match) return await words(body, match.slice(1).map(decodeURIComponent))
  }
  return 'Made a change'
}

/** Records a staff member's successful write once the response has gone out. */
export async function recordStaffActivity(request: Request, response: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) { next(); return }
  const { method, path } = request
  const body = (request.body ?? {}) as Record<string, unknown>
  const role = staffAccess(response).isOwner ? 'SUPER_ADMIN' : 'RECEPTIONIST'
  // Described now, while anything about to be deleted still exists.
  const action = await describe(method, path, body).catch(() => 'Made a change')
  const propertyId = await requestPropertyId(path, body).catch(() => null)
  const propertyName = propertyId ? (await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } }).catch(() => null))?.name ?? null : null
  response.on('finish', () => {
    if (response.statusCode >= 400) return
    const { userId } = response.locals.auth as AuthContext
    void (async () => {
      const staff = await prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } })
      await prisma.staffActivity.create({ data: { staffId: userId, staffName: staff?.name ?? 'A team member', staffRole: role, action, propertyId, propertyName } })
    })().catch((error) => console.error('Recording staff activity failed:', error))
  })
  next()
}

/** Owner routes: receptionists' recent changes for the bell, and the full audit log. Super admins only (see staffGuard.ts). */
export const staffActivityRouter = Router()

staffActivityRouter.get('/staff-activity', async (_request, response) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    response.json(await prisma.staffActivity.findMany({ where: { createdAt: { gte: since }, staffRole: 'RECEPTIONIST' }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, staffName: true, action: true, createdAt: true } }))
  } catch (error) {
    console.error('Staff activity failed:', error)
    response.status(503).json({ error: 'Team activity could not be loaded.' })
  }
})

// The audit log, newest first: up to 1,000 entries, optionally since a date (?from=YYYY-MM-DD). The
// page searches and pages through them itself.
staffActivityRouter.get('/audit-logs', async (request, response) => {
  const from = typeof request.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(request.query.from) ? new Date(`${request.query.from}T00:00:00Z`) : null
  try {
    response.json(await prisma.staffActivity.findMany({ where: from ? { createdAt: { gte: from } } : {}, orderBy: { createdAt: 'desc' }, take: 1000, select: { id: true, staffId: true, staffName: true, staffRole: true, action: true, propertyId: true, propertyName: true, createdAt: true } }))
  } catch (error) {
    console.error('Audit log failed:', error)
    response.status(503).json({ error: 'The audit log could not be loaded.' })
  }
})
