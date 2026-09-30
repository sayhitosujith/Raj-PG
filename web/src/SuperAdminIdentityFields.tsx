import { CountryField } from './CountryField'
import { PhoneField } from './PhoneField'
import { sexLabels, type SuperAdmin } from './superAdmin'

/**
 * The identity inputs shared by the add and edit super admin forms: phone, Aadhaar, sex,
 * nationality and permanent address, all required. Field names match the API's body keys, so a
 * form can submit `Object.fromEntries(new FormData(form))` as-is.
 */
export function SuperAdminIdentityFields({ admin }: { admin?: SuperAdmin }) {
  return (
    <>
      <PhoneField name="phone" label="Phone number" required defaultValue={admin?.phone} />
      <label>Aadhaar number<input name="aadharNumber" inputMode="numeric" pattern="[0-9]{12}" maxLength={12} title="Enter the 12-digit Aadhaar number" required defaultValue={admin?.aadharNumber ?? ''} placeholder="12-digit Aadhaar number" /></label>
      <label>Sex<select name="sex" required defaultValue={admin?.sex ?? ''}><option value="" disabled>Select</option>{Object.entries(sexLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <CountryField name="nationality" label="Nationality" defaultCode={admin?.nationality ?? 'IN'} />
      <label>Permanent address<textarea name="permanentAddress" className="address-input" required defaultValue={admin?.permanentAddress ?? ''} placeholder="Full permanent address" /></label>
    </>
  )
}
