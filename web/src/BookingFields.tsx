import { useState } from 'react'
import type { BookableProperty } from './booking'
import { todayDateInputValue } from './joinDate'
import { PhoneField } from './PhoneField'
import { tenantHint } from './propertyFeatureOptions'
import { formatRupees } from './rent'

// A pasted map link is not something to show in a dropdown; typed areas are.
const readableLocation = (location: string) => (/^https?:\/\//i.test(location.trim()) ? '' : location.trim())

/**
 * The booking-request inputs, shared by the public /book form and the owner's "Add request"
 * dialog. Read back with readBookingFields. The food choice shows each plan's rent when the
 * chosen property sets both prices.
 */
export function BookingFields({ properties }: { properties: BookableProperty[] }) {
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : '')
  const property = properties.find((item) => item.id === propertyId)
  const hasPrices = Boolean(property?.rentWithFood && property.rentWithoutFood)
  return (
    <div className="booking-fields">
      <label>Your name<input name="name" required maxLength={80} autoComplete="name" /></label>
      <PhoneField name="phone" label="Mobile number" required />
      <label className="booking-wide">Email <span>(optional)</span><input name="email" type="email" maxLength={120} autoComplete="email" /></label>
      <label className="booking-wide">Property<select name="propertyId" required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
        <option value="" disabled>Choose a property</option>
        {properties.map((item) => <option key={item.id} value={item.id}>{[item.name, readableLocation(item.location), tenantHint(item.tenantType)].filter(Boolean).join(' · ')}</option>)}
      </select></label>
      <label>Move-in date<input name="moveInDate" type="date" min={todayDateInputValue()} /></label>
      <fieldset className="booking-food">
        <legend>Food plan</legend>
        <label><input type="radio" name="foodOpted" value="yes" defaultChecked />With food{hasPrices && <small>{formatRupees(property!.rentWithFood!)}/month</small>}</label>
        <label><input type="radio" name="foodOpted" value="no" />Without food{hasPrices && <small>{formatRupees(property!.rentWithoutFood!)}/month</small>}</label>
      </fieldset>
      <label className="booking-wide">Message <span>(optional)</span><textarea name="message" rows={3} maxLength={500} placeholder="Room preference, questions, anything we should know" /></label>
    </div>
  )
}
