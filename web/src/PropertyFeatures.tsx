import { DoorOpen, IndianRupee, Users, Wifi } from 'lucide-react'
import { amenityOptions, tenantOptions, type AmenityCode, type TenantType } from './propertyFeatureOptions'

/** A property's resident-facing details: Wi-Fi, important contacts and times ("HH:MM"). */
export type PropertyInfoValues = { wifiName?: string | null; wifiPassword?: string | null; contacts?: string | null; checkInTime?: string | null; checkOutTime?: string | null; gateClosingTime?: string | null }

/**
 * Number of rooms, rent with/without food, "PG for" (required, one of three) and amenity
 * checkboxes for the add/edit property forms. Uncontrolled inputs; read them back with
 * readPropertyFeatures.
 */
export function PropertyFeatureFields({ totalRooms, tenantType, amenities = [], rentWithFood, rentWithoutFood, noticePeriodDays, info }: { totalRooms?: number; tenantType?: TenantType | null; amenities?: string[]; rentWithFood?: number | null; rentWithoutFood?: number | null; noticePeriodDays?: number | null; info?: PropertyInfoValues }) {
  return (
    <div className="property-features">
      <label className="rooms-field"><span className="rooms-field-label"><DoorOpen size={14} /> Number of rooms</span><input name="totalRooms" type="number" inputMode="numeric" min={1} max={1000} step={1} required defaultValue={totalRooms || undefined} placeholder="e.g. 20" /></label>
      <fieldset className="feature-group">
        <legend><IndianRupee size={13} /> Monthly rent</legend>
        <div className="rent-prices">
          <label>With food<input name="rentWithFood" type="number" inputMode="numeric" min={1} max={1000000} step={1} defaultValue={rentWithFood ?? undefined} placeholder="e.g. 15000" /></label>
          <label>Without food<input name="rentWithoutFood" type="number" inputMode="numeric" min={1} max={1000000} step={1} defaultValue={rentWithoutFood ?? undefined} placeholder="e.g. 12000" /></label>
        </div>
        <small className="feature-hint">Residents' rent follows their food plan. Leave both blank to set rent per resident instead.</small>
      </fieldset>
      <label className="rooms-field"><span className="rooms-field-label"><DoorOpen size={14} /> Move-out notice (days)</span><input name="noticePeriodDays" type="number" inputMode="numeric" min={0} max={180} step={1} defaultValue={noticePeriodDays ?? undefined} placeholder="Settings" /></label>
      <small className="feature-hint">How far ahead residents of this property must give notice to move out. Leave blank to use the notice period in Settings.</small>
      <fieldset className="feature-group">
        <legend><Wifi size={13} /> For residents (Info tab)</legend>
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
        <div className="amenity-options">
          {amenityOptions.map(({ value, label, icon: Icon }) => (
            <label key={value} className="amenity-option">
              <input type="checkbox" name="amenities" value={value} defaultChecked={amenities.includes(value)} />
              <Icon size={14} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

/** The amenities a resident's property offers, for their home screen; nothing when none are set. */
export function ResidentAmenities({ amenities = [] }: { amenities?: string[] }) {
  const offered = amenityOptions.filter((option) => amenities.includes(option.value))
  if (!offered.length) return null
  return (
    <div className="resident-amenities" aria-label="Amenities at your property">
      <p className="eyebrow">Amenities</p>
      <div className="resident-amenity-list">{offered.map(({ value, label, icon: Icon }) => <span key={value} className="resident-amenity"><Icon size={14} /> {label}</span>)}</div>
    </div>
  )
}

/** Compact "PG for" + amenity tags for a property card. */
export function PropertyFeatureTags({ tenantType, amenities = [] }: { tenantType?: TenantType | null; amenities?: string[] }) {
  const tenant = tenantOptions.find((option) => option.value === tenantType)
  const offered = amenityOptions.filter((option) => amenities.includes(option.value as AmenityCode))
  return (
    <div className="property-tags">
      <span className={`property-tag tenant${tenant ? '' : ' is-unset'}`}><Users size={11} /> {tenant ? tenant.hint : 'PG for: not set'}</span>
      {offered.map(({ value, label, icon: Icon }) => <span key={value} className="property-tag"><Icon size={11} /> {label}</span>)}
    </div>
  )
}
