/** A resident's vehicle as the API returns it; both parts are optional. */
export type Vehicle = { vehicleType?: string | null; vehicleNumber?: string | null }

/** The types the forms offer; the server accepts only these (keep backend/src/residentFields.ts in step). */
export const vehicleTypes = ['Bike', 'Scooter', 'Car', 'Bicycle'] as const

/** Form field names for the vehicle, so each form posts them without listing them again. */
export const vehicleFields = ['vehicleType', 'vehicleNumber'] as const

/**
 * The vehicle inputs, shared by the resident's "Edit my details" and the owner's resident form.
 * Optional: leaving both blank means no vehicle. A bicycle may have no number; a number needs a type.
 */
export function VehicleFields({ vehicle }: { vehicle?: Vehicle | null }) {
  return (
    <fieldset className="emergency-contact-fields vehicle-fields">
      <legend>Vehicle <span>(optional)</span></legend>
      <div className="emergency-contact-row">
        <label>Type<select name="vehicleType" defaultValue={vehicle?.vehicleType ?? ''}><option value="">No vehicle</option>{vehicleTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Number<input name="vehicleNumber" maxLength={15} autoComplete="off" defaultValue={vehicle?.vehicleNumber ?? ''} placeholder="e.g. KA 01 AB 1234" /></label>
      </div>
    </fieldset>
  )
}

/** The vehicle for a details list: "Bike · KA 01 AB 1234", just the type when there is no number, or "—". */
export function vehicleText({ vehicleType, vehicleNumber }: Vehicle) {
  return [vehicleType, vehicleNumber].filter(Boolean).join(' · ') || '—'
}
