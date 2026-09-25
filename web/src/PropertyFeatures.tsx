import { DoorOpen, Users } from 'lucide-react'
import { amenityOptions, tenantOptions, type AmenityCode, type TenantType } from './propertyFeatureOptions'

/**
 * Number of rooms, "PG for" (required, one of three) and amenity checkboxes for the add/edit
 * property forms. Uncontrolled inputs named totalRooms, tenantType and amenities; read them back
 * with readPropertyFeatures.
 */
export function PropertyFeatureFields({ totalRooms, tenantType, amenities = [] }: { totalRooms?: number; tenantType?: TenantType | null; amenities?: string[] }) {
  return (
    <div className="property-features">
      <label className="rooms-field"><span className="rooms-field-label"><DoorOpen size={14} /> Number of rooms</span><input name="totalRooms" type="number" inputMode="numeric" min={1} max={1000} step={1} required defaultValue={totalRooms || undefined} placeholder="e.g. 20" /></label>
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
