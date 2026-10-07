import { useState } from 'react'
import { CountryField } from './CountryField'
import { isIndian } from './identity'
import { PhoneField } from './PhoneField'
import { sexLabels, type SuperAdmin } from './superAdmin'

/**
 * The identity inputs shared by the add and edit super admin forms and My account: phone, the ID
 * document that matches nationality (Aadhaar for Indian nationals, passport number otherwise, as for
 * residents), sex, nationality and permanent address, all required. The document field switches as
 * the nationality changes. Field names match the API's body keys, so a form can submit its entries
 * as-is; only the shown document field is sent, and the server clears the other one.
 */
export function SuperAdminIdentityFields({ admin }: { admin?: SuperAdmin }) {
  const [nationality, setNationality] = useState(admin?.nationality ?? 'IN')
  return (
    <>
      <PhoneField name="phone" label="Phone number" required defaultValue={admin?.phone} />
      <CountryField name="nationality" label="Nationality" defaultCode={nationality} onChange={(country) => setNationality(country.code)} />
      {isIndian(nationality)
        ? <label>Aadhaar number<input name="aadharNumber" inputMode="numeric" pattern="[0-9]{12}" maxLength={12} title="Enter the 12-digit Aadhaar number" required defaultValue={admin?.aadharNumber ?? ''} placeholder="12-digit Aadhaar number" /></label>
        : <label>Passport number<input name="passportNumber" autoComplete="off" pattern="[A-Za-z0-9]{6,9}" maxLength={9} title="Enter the passport number: 6 to 9 letters and digits" required defaultValue={admin?.passportNumber ?? ''} placeholder="e.g. K1234567" /></label>}
      <label>Sex<select name="sex" required defaultValue={admin?.sex ?? ''}><option value="" disabled>Select</option>{Object.entries(sexLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Permanent address<textarea name="permanentAddress" className="address-input" required defaultValue={admin?.permanentAddress ?? ''} placeholder="Full permanent address" /></label>
    </>
  )
}
