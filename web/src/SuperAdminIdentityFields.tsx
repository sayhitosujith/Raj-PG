import { lazy, Suspense } from 'react'
import { sexLabels, type SuperAdmin } from './superAdmin'

// Split out because the country list and flag URLs are only needed on the super admins page.
const CountrySelect = lazy(() => import('./CountrySelect').then((module) => ({ default: module.CountrySelect })))

/** A country's flag and name, loaded with the country list; shows the bare code until it arrives. */
export const LazyCountryLabel = lazy(() => import('./CountrySelect').then((module) => ({ default: module.CountryLabel })))

/**
 * The identity inputs shared by the add and edit super admin forms: phone, Aadhaar, sex,
 * nationality and permanent address, all required. Field names match the API's body keys, so a
 * form can submit `Object.fromEntries(new FormData(form))` as-is.
 */
export function SuperAdminIdentityFields({ admin }: { admin?: SuperAdmin }) {
  return (
    <>
      <label>Phone number<input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} title="Enter the 10-digit mobile number" required defaultValue={admin?.phone ?? ''} placeholder="10-digit mobile number" /></label>
      <label>Aadhaar number<input name="aadharNumber" inputMode="numeric" pattern="[0-9]{12}" maxLength={12} title="Enter the 12-digit Aadhaar number" required defaultValue={admin?.aadharNumber ?? ''} placeholder="12-digit Aadhaar number" /></label>
      <label>Sex<select name="sex" required defaultValue={admin?.sex ?? ''}><option value="" disabled>Select</option>{Object.entries(sexLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <Suspense fallback={<label>Nationality<input disabled placeholder="Loading countries…" /></label>}><CountrySelect name="nationality" label="Nationality" defaultCode={admin?.nationality ?? 'IN'} /></Suspense>
      <label>Permanent address<textarea name="permanentAddress" required defaultValue={admin?.permanentAddress ?? ''} placeholder="Full permanent address" /></label>
    </>
  )
}
