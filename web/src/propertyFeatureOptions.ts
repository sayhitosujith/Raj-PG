import { AirVent, ArrowUpDown, Cctv, ShieldCheck, ShowerHead, Sparkles, Tv, UtensilsCrossed, Wifi } from 'lucide-react'
import { maxBeds } from './rooms'

/** Who a PG is for; null for properties created before this was asked. */
export type TenantType = 'MEN' | 'WOMEN' | 'COLIVING'
/** Amenity codes as stored by the API (see backend propertyFeatures.ts for the same list). */
export type AmenityCode = 'HOT_WATER' | 'TV' | 'WIFI' | 'SECURITY' | 'LIFT' | 'AC' | 'FOOD' | 'CCTV'

export const tenantOptions: Array<{ value: TenantType; label: string; hint: string }> = [
  { value: 'MEN', label: 'Men', hint: 'Men only' },
  { value: 'WOMEN', label: 'Women', hint: 'Women only' },
  { value: 'COLIVING', label: 'Co-living', hint: 'Men and women' },
]

export const amenityOptions: Array<{ value: AmenityCode; label: string; icon: typeof Wifi }> = [
  { value: 'HOT_WATER', label: 'Hot water', icon: ShowerHead },
  { value: 'TV', label: 'TV', icon: Tv },
  { value: 'WIFI', label: 'Wi-Fi', icon: Wifi },
  { value: 'SECURITY', label: 'Security', icon: ShieldCheck },
  { value: 'LIFT', label: 'Lift', icon: ArrowUpDown },
  { value: 'AC', label: 'AC', icon: AirVent },
  { value: 'FOOD', label: 'Food', icon: UtensilsCrossed },
  { value: 'CCTV', label: 'CCTV', icon: Cctv },
]

/** Longest name and most of their own amenities an owner can add (the API enforces the same). */
export const maxCustomAmenityLength = 30
export const maxCustomAmenities = 12

/** An amenity to show: the built-in ones with their own icon, the owner's own (e.g. "Gym") with a generic one. */
export type AmenityItem = { value: string; label: string; icon: typeof Wifi }

/** Whether a stored amenity is one of the built-in codes rather than the owner's own name. */
export const isAmenityCode = (value: string): value is AmenityCode => amenityOptions.some((option) => option.value === value)

/** Amenities ready to show: built-in ones in their usual order, then the owner's own once each, as entered. */
export function amenityItems(amenities: string[]): AmenityItem[] {
  return [
    ...amenityOptions.filter((option) => amenities.includes(option.value)),
    ...customAmenitiesOf([amenities]).map((value) => ({ value, label: value, icon: Sparkles })),
  ]
}

/** The owner's own amenities across several properties, once each (ignoring case), so one PG's "Gym" is offered on the others. */
export function customAmenitiesOf(lists: string[][]) {
  const names: string[] = []
  for (const value of lists.flat()) if (!isAmenityCode(value) && !names.some((name) => name.toLowerCase() === value.toLowerCase())) names.push(value)
  return names
}

/** The built-in amenity a typed name means (e.g. "wifi" → WIFI), so it is ticked rather than added twice. */
export function builtInAmenityNamed(name: string) {
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  return amenityOptions.find((option) => option.label.toLowerCase().replace(/[^a-z]/g, '') === key || option.value.toLowerCase().replace(/_/g, '') === key)?.value ?? null
}

/** e.g. "Men only"; used in compact places like the overview row. */
export const tenantHint = (type: TenantType | null | undefined) => tenantOptions.find((option) => option.value === type)?.hint ?? null

// Every row of the sharing price table that is on the form; the API drops rows left blank, so sending
// them all replaces the stored list.
function readSharingPrices(form: FormData) {
  return Array.from({ length: maxBeds }, (_, index) => index + 1)
    .filter((beds) => form.has(`sharing-${beds}-withFood`))
    .map((beds) => ({ beds, rentWithFood: form.get(`sharing-${beds}-withFood`), rentWithoutFood: form.get(`sharing-${beds}-withoutFood`) }))
}

/** Reads the PropertyFeatureFields inputs back into the API shape. */
export function readPropertyFeatures(form: FormData) {
  return { tenantType: form.get('tenantType'), amenities: form.getAll('amenities'), totalRooms: form.get('totalRooms'), rentWithFood: form.get('rentWithFood'), rentWithoutFood: form.get('rentWithoutFood'), sharingPrices: readSharingPrices(form), noticePeriodDays: form.get('noticePeriodDays'), wifiName: form.get('wifiName'), wifiPassword: form.get('wifiPassword'), contacts: form.get('contacts'), checkInTime: form.get('checkInTime'), checkOutTime: form.get('checkOutTime'), gateClosingTime: form.get('gateClosingTime') }
}
