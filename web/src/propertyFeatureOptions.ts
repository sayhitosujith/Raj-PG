import { AirVent, ArrowUpDown, Cctv, ShieldCheck, ShowerHead, Tv, UtensilsCrossed, Wifi } from 'lucide-react'
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
