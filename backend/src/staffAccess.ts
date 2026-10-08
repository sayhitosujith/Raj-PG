import type { NextFunction, Request, Response } from 'express'
import type { AuthContext } from './auth.js'

/**
 * What a signed-in staff member may reach. Super admins (owners) reach every property; receptionists only
 * the properties assigned to them. Routes read it from the request and turn it into Prisma filters
 * with the helpers below, so a receptionist's lists and actions stay inside their properties.
 */
export type StaffAccess = { isOwner: true } | { isOwner: false; propertyIds: string[] }

/** The caller's access; set by requireRole for staff sessions. */
export function staffAccess(response: Response): StaffAccess {
  const staff = (response.locals.auth as AuthContext | undefined)?.staff
  // Fail closed: a staff route reached without access details sees nothing rather than everything.
  return staff ?? { isOwner: false, propertyIds: [] }
}

/** Lets only super admins through (settings, views, the team, deleting properties and records). */
export function requireOwner(_request: Request, response: Response, next: NextFunction) {
  if (staffAccess(response).isOwner) { next(); return }
  response.status(403).json({ error: 'Only a super admin can do this.' })
}

/** A `where` for Property rows the caller may see. */
export const propertyWhere = (access: StaffAccess) => access.isOwner ? {} : { id: { in: access.propertyIds } }

/** A `where` for rows with their own propertyId (payments, requests, bookings, announcements…). */
export const propertyIdWhere = (access: StaffAccess) => access.isOwner ? {} : { propertyId: { in: access.propertyIds } }

/** A `where` for residents, who belong to a property through their room. */
export const residentWhere = (access: StaffAccess) => access.isOwner ? {} : { room: { propertyId: { in: access.propertyIds } } }

/** A `where` for rows that belong to a resident (rent payments, concessions…). */
export const residentOwnedWhere = (access: StaffAccess) => access.isOwner ? {} : { resident: residentWhere(access) }

/** Whether the caller may act on the given property. */
export const canReachProperty = (access: StaffAccess, propertyId: string | null | undefined) => access.isOwner || (Boolean(propertyId) && access.propertyIds.includes(propertyId as string))
