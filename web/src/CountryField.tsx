import { lazy, Suspense } from 'react'
import type { Country } from './countries'

// Split out because the country list and flag URLs are only needed once a nationality is shown or edited.
const CountrySelect = lazy(() => import('./CountrySelect').then((module) => ({ default: module.CountrySelect })))

/** A country's flag and name, loaded with the country list; shows the bare code until it arrives. */
export const LazyCountryLabel = lazy(() => import('./CountryFlag').then((module) => ({ default: module.CountryLabel })))

/**
 * A labelled nationality picker, loaded on demand. While it loads nothing is submitted under
 * `name`, so the server keeps the value on file.
 */
export function CountryField({ name, label, defaultCode, onChange }: { name: string; label: string; defaultCode: string; onChange?: (country: Country) => void }) {
  return (
    <Suspense fallback={<label>{label}<input disabled placeholder="Loading countries…" /></label>}>
      <CountrySelect name={name} label={label} defaultCode={defaultCode} onChange={onChange} />
    </Suspense>
  )
}
