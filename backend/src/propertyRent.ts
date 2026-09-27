import type { Prisma } from '@prisma/client'
import { maxMonthlyRent, parseMonthlyRent } from './rent.js'

/**
 * Property pricing: a property can set one rent with food and one without. When it does, each
 * resident's monthlyRent is derived from it by their food choice and kept in sync here, so the
 * rent cycle (reminders, overdue, late fee) keeps reading one stored number. Properties without
 * prices keep the owner's per-resident rent.
 */
type PropertyRents = { rentWithFood: number | null; rentWithoutFood: number | null }
type RentWrite = { monthlyRent?: number | null; rentTrackedFrom?: Date | null }

const toAmount = (value: unknown) => value === '' || value === null ? null : typeof value === 'string' ? Number(value) : value
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maxMonthlyRent

/** Validates the two property rents: both whole rupees, or both blank to price per resident. */
export function parsePropertyRents(body: { rentWithFood?: unknown; rentWithoutFood?: unknown }): { data: Partial<PropertyRents> } | { error: string } {
  if (body.rentWithFood === undefined && body.rentWithoutFood === undefined) return { data: {} }
  const withFood = toAmount(body.rentWithFood)
  const withoutFood = toAmount(body.rentWithoutFood)
  if (withFood === null && withoutFood === null) return { data: { rentWithFood: null, rentWithoutFood: null } }
  if (withFood === null || withoutFood === null) return { error: 'Enter both rents (with and without food), or leave both blank.' }
  if (!isAmount(withFood) || !isAmount(withoutFood)) return { error: 'Rents must be whole numbers of rupees.' }
  return { data: { rentWithFood: withFood, rentWithoutFood: withoutFood } }
}

/** The rent a property charges for a food choice, or null when it does not set prices. */
export function rentFor(property: PropertyRents, foodOpted: boolean) {
  if (property.rentWithFood === null || property.rentWithoutFood === null) return null
  return foodOpted ? property.rentWithFood : property.rentWithoutFood
}

/**
 * The rent fields to write for one resident: from the property's prices when it has them,
 * otherwise from the owner's typed monthly rent (unchanged behaviour). Rent tracking starts the
 * first time a resident gets a rent, so turning pricing on never invents back-rent.
 */
export async function residentRentWrite(client: Prisma.TransactionClient, input: { propertyId: string; foodOpted: boolean; trackedFrom: Date | null; typedRent: unknown }): Promise<{ data: RentWrite } | { error: string }> {
  const property = await client.property.findUniqueOrThrow({ where: { id: input.propertyId }, select: { rentWithFood: true, rentWithoutFood: true } })
  const priced = rentFor(property, input.foodOpted)
  if (priced !== null) return { data: { monthlyRent: priced, ...(input.trackedFrom ? {} : { rentTrackedFrom: new Date() }) } }
  return parseMonthlyRent(input.typedRent, input.trackedFrom) ?? { data: {} }
}

/** Re-applies a property's prices to everyone living there, after the owner changes them. */
export async function syncPropertyRents(client: Prisma.TransactionClient, propertyId: string) {
  const property = await client.property.findUniqueOrThrow({ where: { id: propertyId }, select: { rentWithFood: true, rentWithoutFood: true } })
  if (property.rentWithFood === null || property.rentWithoutFood === null) return
  const residents = { room: { propertyId } } satisfies Prisma.ResidentWhereInput
  await client.resident.updateMany({ where: { ...residents, foodOpted: true }, data: { monthlyRent: property.rentWithFood } })
  await client.resident.updateMany({ where: { ...residents, foodOpted: false }, data: { monthlyRent: property.rentWithoutFood } })
  await client.resident.updateMany({ where: { ...residents, rentTrackedFrom: null }, data: { rentTrackedFrom: new Date() } })
}
