import type { Prisma } from '@prisma/client'
import { maxBeds } from './occupancy.js'
import { maxMonthlyRent, parseMonthlyRent } from './rent.js'

/**
 * Property pricing: a property can set a standard rent with food and one without, and its own pair
 * for any sharing type (Single, 2 sharing…). A resident's rent is the pair for their room's bed count
 * when there is one, otherwise the standard pair, picked by their food choice. It is stored on the
 * resident and kept in sync here, so the rent cycle (reminders, overdue, late fee) keeps reading one
 * number. Residents with no matching price keep the owner's per-resident rent.
 */
type PricePair = { rentWithFood: number | null; rentWithoutFood: number | null }
type SharingPriceRow = { beds: number; rentWithFood: number; rentWithoutFood: number }
type RentWrite = { monthlyRent?: number | null; rentTrackedFrom?: Date | null }

/** What a property must load to price a room. */
export const pricingSelect = { rentWithFood: true, rentWithoutFood: true, sharingPrices: { select: { beds: true, rentWithFood: true, rentWithoutFood: true } } } satisfies Prisma.PropertySelect
type PropertyPricing = PricePair & { sharingPrices: SharingPriceRow[] }

const toAmount = (value: unknown) => value === '' || value === null || value === undefined ? null : typeof value === 'string' ? Number(value) : value
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maxMonthlyRent
const sharingName = (beds: number) => beds === 1 ? 'Single' : `${beds} sharing`

// One with/without-food pair: both whole rupees, both blank (null), or an error naming the pair.
function parsePair(withFoodValue: unknown, withoutFoodValue: unknown, name: string): { pair: { rentWithFood: number; rentWithoutFood: number } | null } | { error: string } {
  const withFood = toAmount(withFoodValue)
  const withoutFood = toAmount(withoutFoodValue)
  if (withFood === null && withoutFood === null) return { pair: null }
  if (withFood === null || withoutFood === null) return { error: `${name}: enter both rents (with and without food), or leave both blank.` }
  if (!isAmount(withFood) || !isAmount(withoutFood)) return { error: `${name}: rents must be whole numbers of rupees.` }
  // Catches a slipped digit (₹80,000 for ₹8,000): food is extra, so it never makes rent cheaper.
  if (withoutFood > withFood) return { error: `${name}: the rent without food (₹${withoutFood.toLocaleString('en-IN')}) is more than with food (₹${withFood.toLocaleString('en-IN')}). Check for a typo.` }
  return { pair: { rentWithFood: withFood, rentWithoutFood: withoutFood } }
}

/** Validates the standard rents: both whole rupees, or both blank to price per resident. */
export function parsePropertyRents(body: { rentWithFood?: unknown; rentWithoutFood?: unknown }): { data: Partial<PricePair> } | { error: string } {
  if (body.rentWithFood === undefined && body.rentWithoutFood === undefined) return { data: {} }
  const parsed = parsePair(body.rentWithFood, body.rentWithoutFood, 'Standard price')
  if ('error' in parsed) return parsed
  return { data: parsed.pair ?? { rentWithFood: null, rentWithoutFood: null } }
}

/**
 * Validates the prices by sharing type, sent as the full list ([{ beds, rentWithFood, rentWithoutFood }]).
 * Rows left blank are dropped; undefined leaves the stored list alone.
 */
export function parseSharingPrices(value: unknown): { rows?: SharingPriceRow[] } | { error: string } {
  if (value === undefined) return {}
  if (!Array.isArray(value)) return { error: 'Sharing prices must be a list.' }
  const rows: SharingPriceRow[] = []
  for (const item of value as Array<Record<string, unknown>>) {
    const beds = item?.beds
    if (typeof beds !== 'number' || !Number.isInteger(beds) || beds < 1 || beds > maxBeds) return { error: `Sharing type must be 1 to ${maxBeds} beds.` }
    if (rows.some((row) => row.beds === beds)) return { error: `${sharingName(beds)} is listed twice.` }
    const parsed = parsePair(item.rentWithFood, item.rentWithoutFood, sharingName(beds))
    if ('error' in parsed) return parsed
    if (parsed.pair) rows.push({ beds, ...parsed.pair })
  }
  return { rows }
}

/** The rent a property charges for a room size and food choice, or null when it sets no price for it. */
export function rentFor(property: PropertyPricing, beds: number, foodOpted: boolean) {
  const pair: PricePair = property.sharingPrices.find((price) => price.beds === beds) ?? property
  if (pair.rentWithFood === null || pair.rentWithoutFood === null) return null
  return foodOpted ? pair.rentWithFood : pair.rentWithoutFood
}

/**
 * The rent fields to write for one resident in a room: from the property's prices when it has one
 * for that room, otherwise from the owner's typed monthly rent (unchanged behaviour). Rent tracking
 * starts the first time a resident gets a rent, so turning pricing on never invents back-rent.
 */
export async function residentRentWrite(client: Prisma.TransactionClient, input: { roomId: string; foodOpted: boolean; trackedFrom: Date | null; typedRent: unknown }): Promise<{ data: RentWrite } | { error: string }> {
  const room = await client.room.findUniqueOrThrow({ where: { id: input.roomId }, select: { beds: true, property: { select: pricingSelect } } })
  const priced = rentFor(room.property, room.beds, input.foodOpted)
  if (priced !== null) return { data: { monthlyRent: priced, ...(input.trackedFrom ? {} : { rentTrackedFrom: new Date() }) } }
  return parseMonthlyRent(input.typedRent, input.trackedFrom) ?? { data: {} }
}

/** Re-applies a property's prices to everyone living there, after its prices or a room's beds change. */
export async function syncPropertyRents(client: Prisma.TransactionClient, propertyId: string) {
  const [property, residents] = await Promise.all([
    client.property.findUniqueOrThrow({ where: { id: propertyId }, select: pricingSelect }),
    client.resident.findMany({ where: { room: { propertyId } }, select: { id: true, foodOpted: true, rentTrackedFrom: true, room: { select: { beds: true } } } }),
  ])
  for (const resident of residents) {
    const priced = resident.room ? rentFor(property, resident.room.beds, resident.foodOpted) : null
    if (priced === null) continue
    await client.resident.update({ where: { id: resident.id }, data: { monthlyRent: priced, ...(resident.rentTrackedFrom ? {} : { rentTrackedFrom: new Date() }) } })
  }
}
