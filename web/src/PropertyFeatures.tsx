import { DoorOpen, IndianRupee, Users, Wifi } from 'lucide-react'
import { AmenityPicker } from './AmenityPicker'
import { amenityItems, isAmenityCode, tenantOptions, type TenantType } from './propertyFeatureOptions'
import { checkPricePair, type SharingPrice } from './pricing'
import { SharingPriceTable } from './SharingPriceTable'

/** A property's resident-facing details: Wi-Fi, important contacts and times ("HH:MM"). */
export type PropertyInfoValues = { wifiName?: string | null; wifiPassword?: string | null; contacts?: string | null; checkInTime?: string | null; checkOutTime?: string | null; gateClosingTime?: string | null }

/**
 * Number of rooms, rent with/without food (standard, and by sharing type), "PG for" (required, one of three) and amenity
 * checkboxes (with the owner's own amenities) for the add/edit property forms. Uncontrolled inputs; read them back with
 * readPropertyFeatures.
 */
export function PropertyFeatureFields({ propertyId, totalRooms, tenantType, amenities = [], rentWithFood, rentWithoutFood, sharingPrices = [], noticePeriodDays, info, amenitySuggestions = [] }: { /** Set when editing, to show which rooms each sharing price covers. */ propertyId?: string; totalRooms?: number; tenantType?: TenantType | null; amenities?: string[]; rentWithFood?: number | null; rentWithoutFood?: number | null; sharingPrices?: SharingPrice[]; noticePeriodDays?: number | null; info?: PropertyInfoValues; /** The owner's own amenities from their other PGs, offered here too. */ amenitySuggestions?: string[] }) {
  return (
    <div className="property-features">
      <label className="rooms-field"><span className="rooms-field-label"><DoorOpen size={14} /> Number of rooms</span><input name="totalRooms" type="number" inputMode="numeric" min={1} max={1000} step={1} required defaultValue={totalRooms || undefined} placeholder="e.g. 20" /></label>
      <fieldset className="feature-group" onInput={checkPricePair}>
        <legend><IndianRupee size={13} /> Monthly rent</legend>
        <div className="rent-prices">
          <label>With food<input name="rentWithFood" data-price-pair="standard" data-food="with" type="number" inputMode="numeric" min={1} max={1000000} step={1} defaultValue={rentWithFood ?? undefined} placeholder="e.g. 15000" /></label>
          <label>Without food<input name="rentWithoutFood" data-price-pair="standard" data-food="without" type="number" inputMode="numeric" min={1} max={1000000} step={1} defaultValue={rentWithoutFood ?? undefined} placeholder="e.g. 12000" /></label>
        </div>
        <small className="feature-hint">Standard price for every room. Residents' rent follows their food plan. Leave both blank to set rent per resident instead.</small>
        <SharingPriceTable propertyId={propertyId} prices={sharingPrices} />
        <small className="feature-hint">Optional. A room's beds (set under Rooms) pick its row; blank rows use the standard price above.</small>
      </fieldset>
      <label className="rooms-field"><span className="rooms-field-label"><DoorOpen size={14} /> Move-out notice (days)</span><input name="noticePeriodDays" type="number" inputMode="numeric" min={0} max={180} step={1} defaultValue={noticePeriodDays ?? undefined} placeholder="Settings" /></label>
      <small className="feature-hint">How far ahead residents of this property must give notice to move out. Leave blank to use the notice period in Settings.</small>
      <fieldset className="feature-group">
        <legend><Wifi size={13} /> For residents (Help tab)</legend>
        <div className="rent-prices">
          <label>Wi-Fi name<input name="wifiName" maxLength={64} defaultValue={info?.wifiName ?? ''} placeholder="e.g. PremiumStay_5G" /></label>
          <label>Wi-Fi password<input name="wifiPassword" maxLength={64} defaultValue={info?.wifiPassword ?? ''} placeholder="Shown only to residents" /></label>
        </div>
        <div className="info-times">
          <label>Check-in<input name="checkInTime" type="time" defaultValue={info?.checkInTime ?? ''} /></label>
          <label>Check-out<input name="checkOutTime" type="time" defaultValue={info?.checkOutTime ?? ''} /></label>
          <label>Gate closes<input name="gateClosingTime" type="time" defaultValue={info?.gateClosingTime ?? ''} /></label>
        </div>
        <label>Important contacts<textarea name="contacts" rows={4} maxLength={1500} defaultValue={info?.contacts ?? ''} placeholder={'One per line, name then number:\nWarden – Ravi: 98450 12345\nNearest hospital: 080 2222 3333'} /></label>
        <small className="feature-hint">All optional. Residents of this property see these under Info, with tap-to-call contacts.</small>
      </fieldset>
      <fieldset className="feature-group">
        <legend>PG for</legend>
        <div className="tenant-options">
          {tenantOptions.map((option, index) => (
            <label key={option.value} className="tenant-option">
              <input type="radio" name="tenantType" value={option.value} defaultChecked={tenantType === option.value} required={index === 0} />
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="feature-group">
        <legend>Amenities</legend>
        <AmenityPicker amenities={amenities} suggestions={amenitySuggestions} />
      </fieldset>
    </div>
  )
}

/** How many colours owner-added amenities share (is-custom-0 to is-custom-5 in portalTheme.css). */
const CUSTOM_AMENITY_COLOURS = 6

/**
 * The colour class for one amenity chip: the built-in ones by name (is-wifi, is-hot_water…), an
 * owner-added one by a hash of its name, so "Laundry" keeps the same colour every time.
 */
function amenityColourClass(value: string) {
  if (isAmenityCode(value)) return `is-${value.toLowerCase()}`
  let hash = 0
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `is-custom-${hash % CUSTOM_AMENITY_COLOURS}`
}

/** The amenities a resident's property offers, for their home screen; nothing when none are set. */
export function ResidentAmenities({ amenities = [] }: { amenities?: string[] }) {
  const offered = amenityItems(amenities)
  if (!offered.length) return null
  return (
    <div className="resident-amenities" aria-label="Amenities at your property">
      <p className="eyebrow">Amenities</p>
      <div className="resident-amenity-list">{offered.map(({ value, label, icon: Icon }) => <span key={value} className={`resident-amenity ${amenityColourClass(value)}`}><Icon size={14} /> {label}</span>)}</div>
    </div>
  )
}

/** Compact "PG for" + amenity tags for a property card. */
export function PropertyFeatureTags({ tenantType, amenities = [] }: { tenantType?: TenantType | null; amenities?: string[] }) {
  const tenant = tenantOptions.find((option) => option.value === tenantType)
  const offered = amenityItems(amenities)
  return (
    <div className="property-tags">
      <span className={`property-tag tenant${tenant ? '' : ' is-unset'}`}><Users size={11} /> {tenant ? tenant.hint : 'PG for: not set'}</span>
      {offered.map(({ value, label, icon: Icon }) => <span key={value} className="property-tag"><Icon size={11} /> {label}</span>)}
    </div>
  )
}
