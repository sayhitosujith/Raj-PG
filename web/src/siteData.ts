import type { BookableProperty } from './booking'
import type { Meal, MealTimes } from './meals'
import type { SharingPrice } from './pricing'
import type { SiteContent } from './siteContent'
import type { HouseRules } from './workspaceSettings'

/** One property as the public website shows it (see backend publicSite.ts). */
export type SiteProperty = BookableProperty & {
  city: string | null
  /** The PG's own website, if the owner added one. */
  websiteUrl: string | null
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
export type SiteData = { businessName: string; contactPhone: string | null; contactEmail: string | null; houseRules: HouseRules; /** The owner's policies (Settings); empty when cleared. */ termsAndConditions: string; privacyPolicy: string; /** The owner's website text and switched-off sections (admin Website page). */ content: SiteContent; /** The banner image chosen on the Website page, or null for the gradient. */ bannerUrl: string | null; properties: SiteProperty[] }

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

// Owners type an area ("White field") or paste a map link into Location; only http(s) values are links.
const isMapLink = (value: string) => /^https?:\/\//i.test(value.trim())

/**
 * A property's address as shown on the site: the typed area plus the city ("White field, Bengaluru"),
 * the area alone when it already names the city, or just the city when Location is a map link.
 */
export function addressOf(property: SiteProperty) {
  const area = property.location && !isMapLink(property.location) ? property.location.trim() : ''
  const city = property.city?.trim() ?? ''
  if (area && city && !area.toLowerCase().includes(city.toLowerCase())) return `${area}, ${city}`
  return area || city
}

/** The map link the owner pasted as the property's Location, or null when they typed an area instead. */
export const mapLinkOf = (property: SiteProperty) => property.location && isMapLink(property.location) ? property.location.trim() : null

/** Name used for properties whose city has not been set (Edit property → City). */
export const unknownLocation = 'Other areas'

/** The area a property is in, as the website groups them. */
export const locationOf = (property: SiteProperty) => property.city?.trim() || unknownLocation

/**
 * The areas there are PGs in, each with its properties, free beds and lowest price, in name order
 * (properties without a city last), for "Available locations" and the location filter.
 */
export function locationsOf(properties: SiteProperty[]) {
  const groups = new Map<string, SiteProperty[]>()
  for (const property of properties) groups.set(locationOf(property), [...(groups.get(locationOf(property)) ?? []), property])
  return [...groups].map(([name, items]) => {
    const prices = items.map(startingPrice).filter((price): price is number => price !== null)
    return { name, properties: items, freeBeds: items.reduce((sum, item) => sum + item.freeBeds, 0), from: prices.length ? Math.min(...prices) : null }
  }).sort((a, b) => Number(a.name === unknownLocation) - Number(b.name === unknownLocation) || a.name.localeCompare(b.name))
}

/**
 * Room options across all PGs, like plan cards: each sharing type with the lowest rent with and
 * without food anywhere, and how many PGs offer it. Standard prices count as offering every sharing
 * type a property has no price of its own for, so only types someone has priced are listed.
 */
export function roomOptionsOf(properties: SiteProperty[]) {
  const beds = [...new Set(properties.flatMap((property) => property.sharingPrices.map((price) => price.beds)))].sort((a, b) => a - b)
  return beds.map((count) => {
    const offers = properties.map((property) => property.sharingPrices.find((price) => price.beds === count) ?? (property.rentWithFood && property.rentWithoutFood ? { rentWithFood: property.rentWithFood, rentWithoutFood: property.rentWithoutFood } : null))
      .filter((offer): offer is { rentWithFood: number; rentWithoutFood: number } => offer !== null)
    return { beds: count, withFood: Math.min(...offers.map((offer) => offer.rentWithFood)), withoutFood: Math.min(...offers.map((offer) => offer.rentWithoutFood)), propertyCount: offers.length }
  })
}

/** All the photos to show off: each property's cover then its gallery, with whose they are. */
export function photosOf(properties: SiteProperty[]) {
  return properties.flatMap((property) => [
    ...(property.image ? [{ key: `${property.id}-cover`, url: property.image, caption: property.name, propertyId: property.id }] : []),
    ...property.photos.map((photo) => ({ key: photo.id, url: photo.url, caption: photo.caption ?? property.name, propertyId: property.id })),
  ])
}

/** ISO weekdays in order, for the weekly menu. */
export const weekdays = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']] as const

/** A wa.me chat link for a stored phone number (E.164 or bare Indian digits), with a message typed in when given. */
export const whatsappLink = (phone: string, text?: string) => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}${text ? `?text=${encodeURIComponent(text)}` : ''}`
