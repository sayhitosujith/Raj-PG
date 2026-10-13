import { TenantType } from '@prisma/client'

/**
 * Amenities an owner can tick for a property. Stored as these codes in Property.amenities, so
 * adding one (e.g. AC or laundry) is a one-line change here and in the web labels, not a migration.
 */
export const amenityCodes = ['HOT_WATER', 'TV', 'WIFI', 'SECURITY', 'LIFT', 'AC', 'FOOD', 'CCTV'] as const

const maxCustomAmenities = 12
const maxCustomAmenityLength = 30

/**
 * Validated amenity list, or an error. Besides the codes above, an owner may add their own amenities
 * (e.g. "Gym"), stored as their name in the same list. Codes come first in the canonical order, then
 * the owner's own in the order given, de-duplicated ignoring case.
 */
export function parseAmenities(value: unknown): { amenities: string[] } | { error: string } {
  if (!Array.isArray(value)) return { error: 'Amenities must be a list.' }
  if (value.some((item) => typeof item !== 'string')) return { error: 'Amenities must be names.' }
  const custom: string[] = []
  for (const item of value as string[]) {
    const name = item.trim().replace(/\s+/g, ' ')
    if (!name || (amenityCodes as readonly string[]).includes(name)) continue
    if (name.length > maxCustomAmenityLength) return { error: `An amenity name can be up to ${maxCustomAmenityLength} characters.` }
    if (/[\p{Cc}<>]/u.test(name)) return { error: `"${name}" has characters an amenity name cannot use.` }
    if (!custom.some((existing) => existing.toLowerCase() === name.toLowerCase())) custom.push(name)
  }
  if (custom.length > maxCustomAmenities) return { error: `Add up to ${maxCustomAmenities} amenities of your own.` }
  return { amenities: [...amenityCodes.filter((code) => value.includes(code)), ...custom] }
}

/** Who the PG is for. Required when creating a property; optional on update. */
export function parseTenantType(value: unknown, required: boolean): { tenantType?: TenantType } | { error: string } {
  if (value === undefined || value === null || value === '') return required ? { error: 'Choose who the PG is for: men, women, or co-living.' } : {}
  if (typeof value !== 'string' || !(value in TenantType)) return { error: 'Choose who the PG is for: men, women, or co-living.' }
  return { tenantType: value as TenantType }
}

const maxTotalRooms = 1000

/** Declared room capacity: a whole number from 1 to 1000. Required on create, optional on update. */
export function parseTotalRooms(value: unknown, required: boolean): { totalRooms?: number } | { error: string } {
  if (value === undefined || value === null || value === '') return required ? { error: 'Enter the number of rooms.' } : {}
  const rooms = typeof value === 'string' ? Number(value) : value
  if (typeof rooms !== 'number' || !Number.isInteger(rooms) || rooms < 1 || rooms > maxTotalRooms) return { error: `Number of rooms must be a whole number from 1 to ${maxTotalRooms}.` }
  return { totalRooms: rooms }
}
