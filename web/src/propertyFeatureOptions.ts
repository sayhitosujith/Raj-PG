import { ArrowUpDown, ShieldCheck, ShowerHead, Tv, Wifi } from 'lucide-react'

/** Who a PG is for; null for properties created before this was asked. */
export type TenantType = 'MEN' | 'WOMEN' | 'COLIVING'
/** Amenity codes as stored by the API (see backend propertyFeatures.ts for the same list). */
export type AmenityCode = 'HOT_WATER' | 'TV' | 'WIFI' | 'SECURITY' | 'LIFT'

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
]

/** e.g. "Men only"; used in compact places like the overview row. */
export const tenantHint = (type: TenantType | null | undefined) => tenantOptions.find((option) => option.value === type)?.hint ?? null

/** Reads the PropertyFeatureFields inputs back into the API shape. */
export function readPropertyFeatures(form: FormData) {
  return { tenantType: form.get('tenantType'), amenities: form.getAll('amenities'), totalRooms: form.get('totalRooms') }
}
