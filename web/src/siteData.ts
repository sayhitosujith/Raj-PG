import type { BookableProperty } from './booking'
import type { Meal, MealTimes } from './meals'
import type { SharingPrice } from './pricing'
import type { HouseRules } from './workspaceSettings'

/** One property as the public website shows it (see backend publicSite.ts). */
export type SiteProperty = BookableProperty & {
  city: string | null
  amenities: string[]
  sharingPrices: SharingPrice[]
  freeBeds: number
  totalBeds: number
  noticePeriodDays: number
  checkInTime: string | null
  checkOutTime: string | null
  gateClosingTime: string | null
  /** Cover photo URL, or null when none was set. */
  image: string | null
  photos: Array<{ id: string; caption: string | null; url: string }>
  mealTimes: MealTimes
  /** Weekly menu: ISO weekday (1 = Monday) and meal. */
  menu: Array<{ weekday: number; meal: Meal; items: string }>
}

/** Everything the public website shows. */
export type SiteData = { businessName: string; contactPhone: string | null; contactEmail: string | null; houseRules: HouseRules; properties: SiteProperty[] }

export async function fetchSite() {
  const response = await fetch('/api/public/site')
  if (!response.ok) throw new Error('Site request failed')
  return await response.json() as SiteData
}

/** The lowest monthly rent a property charges (any sharing type, with or without food), or null when it sets no prices. */
export function startingPrice(property: SiteProperty) {
  const amounts = [property.rentWithFood, property.rentWithoutFood, ...property.sharingPrices.flatMap((price) => [price.rentWithFood, price.rentWithoutFood])]
    .filter((amount): amount is number => typeof amount === 'number' && amount > 0)
  return amounts.length ? Math.min(...amounts) : null
}

/** ISO weekdays in order, for the weekly menu. */
export const weekdays = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']] as const

/** A wa.me chat link for a stored phone number (E.164 or bare Indian digits). */
export const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`
