import { useEffect, useId, useRef, useState } from 'react'
import { CountryCombobox } from './CountryCombobox'
import { dialCountries, isValidPhone, splitPhone, toE164, type DialCountry } from './phone'

export type PhoneInputProps = {
  /** Form field name; the number is submitted under it in E.164 form ("+919876543210"). */
  name: string
  label: string
  /** Muted text after the label, e.g. "(optional)". */
  hint?: string
  required?: boolean
  /** A stored number to edit: E.164, or a legacy bare Indian number. */
  defaultValue?: string | null
}

const dialDetail = (country: DialCountry) => `+${country.dialCode}`

/**
 * A phone field: a flag and calling-code picker (India by default) beside the number. The number
 * is checked for the chosen country as it is typed, so the form will not submit an impossible
 * one; the server validates again.
 */
export function PhoneInput({ name, label, hint, required = false, defaultValue }: PhoneInputProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [initial] = useState(() => splitPhone(defaultValue ?? ''))
  const [country, setCountry] = useState(initial.country)
  const [national, setNational] = useState(initial.national)
  const e164 = national.trim() ? toE164(country, national) : ''

  useEffect(() => {
    inputRef.current?.setCustomValidity(e164 && !isValidPhone(e164) ? `Enter a valid ${country.name} number (+${country.dialCode}).` : '')
  }, [e164, country])

  return (
    <div className="phone-field">
      <label htmlFor={inputId}>{label}{hint && <span> {hint}</span>}</label>
      <div className="phone-input">
        <CountryCombobox options={dialCountries} selected={country} onSelect={setCountry} label="Country code" optionDetail={dialDetail} selectedText={dialDetail} className="phone-country" />
        <input ref={inputRef} id={inputId} type="tel" inputMode="tel" autoComplete="tel-national" required={required} value={national} onChange={(event) => setNational(event.target.value)} placeholder={country.code === 'IN' ? 'e.g. 9876543210' : 'Phone number'} />
      </div>
      <input type="hidden" name={name} value={e164} />
    </div>
  )
}
