import { PhoneField, PhoneText } from './PhoneField'

/** A resident's emergency contact as the API returns it; every part is optional. */
export type EmergencyContact = { emergencyContactName?: string | null; emergencyContactRelation?: string | null; emergencyContactPhone?: string | null; emergencyContactEmail?: string | null }

/** The relationships a resident can pick; the server accepts only these (keep backend/src/residentFields.ts in step). */
export const emergencyContactRelations = ['Father', 'Mother', 'Spouse', 'Sister', 'Legal guardian'] as const

/** Form field names for the contact, so each form posts them without listing them again. */
export const emergencyContactFields = ['emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone', 'emergencyContactEmail'] as const

/**
 * The emergency contact inputs, shared by the resident's "Edit my details" and the owner's resident
 * form so both post the same fields. The email is required (the server refuses a form without it); the
 * server also asks for a number when a name or relationship is given.
 */
export function EmergencyContactFields({ contact }: { contact?: EmergencyContact | null }) {
  return (
    <fieldset className="emergency-contact-fields">
      <legend>Emergency contact</legend>
      <div className="emergency-contact-row">
        <label>Name<input name="emergencyContactName" maxLength={80} defaultValue={contact?.emergencyContactName ?? ''} placeholder="e.g. Ravi Kumar" /></label>
        <label>Relationship<select name="emergencyContactRelation" defaultValue={contact?.emergencyContactRelation ?? ''}><option value="">Select</option>{emergencyContactRelations.map((relation) => <option key={relation}>{relation}</option>)}</select></label>
      </div>
      <PhoneField name="emergencyContactPhone" label="Phone" defaultValue={contact?.emergencyContactPhone ?? ''} />
      <label>Email<input name="emergencyContactEmail" type="email" required maxLength={120} autoComplete="off" defaultValue={contact?.emergencyContactEmail ?? ''} placeholder="e.g. ravi.kumar@gmail.com" /></label>
    </fieldset>
  )
}

/**
 * The contact for a details list: "Ravi Kumar (Father)" with the number on the line below, as a call
 * link so it can be rung from a phone, and their email under that as a mail link. The email is required now but
 * older contacts may lack one, so that shows as "Email not added" (a prompt to fill it in) rather than nothing.
 * "—" when there is none.
 */
export function EmergencyContactText({ contact }: { contact: EmergencyContact }) {
  const { emergencyContactName: name, emergencyContactRelation: relation, emergencyContactPhone: phone, emergencyContactEmail: email } = contact
  if (!phone) return <>—</>
  const who = [name, relation && `(${relation})`].filter(Boolean).join(' ')
  return <>{who && <>{who}<br /></>}<a className="emergency-contact-call" href={`tel:${phone}`}><PhoneText value={phone} /></a><br />{email ? <a className="emergency-contact-call" href={`mailto:${email}`}>{email}</a> : <span className="emergency-contact-missing">Email not added</span>}</>
}
