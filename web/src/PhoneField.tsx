import { lazy, Suspense } from 'react'
import type { PhoneInputProps } from './PhoneInput'

// Split out because the phone metadata and country list are only needed once a phone number is
// shown or edited, not on every page.
const PhoneInput = lazy(() => import('./PhoneInput').then((module) => ({ default: module.PhoneInput })))
const PhoneLabel = lazy(() => import('./PhoneLabel').then((module) => ({ default: module.PhoneLabel })))

/**
 * A phone number field with a country-code picker, loaded on demand. Until it arrives, a plain
 * input under the same name stands in; the server reads a number without a code as Indian.
 */
export function PhoneField(props: PhoneInputProps) {
  const { name, label, hint, required, defaultValue } = props
  return (
    <Suspense fallback={<label>{label}{hint && <span> {hint}</span>}<input name={name} type="tel" required={required} defaultValue={defaultValue ?? ''} /></label>}>
      <PhoneInput {...props} />
    </Suspense>
  )
}

/** A stored phone number with its country's flag, loaded on demand; shows the raw value meanwhile. */
export function PhoneText({ value }: { value: string }) {
  return (
    <Suspense fallback={<span className="phone-label">{value}</span>}>
      <PhoneLabel value={value} />
    </Suspense>
  )
}
