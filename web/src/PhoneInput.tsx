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
const indianDigits = 10

/**
 * Indian numbers are typed as their 10 digits only: anything else is dropped as it is typed, and a
 * pasted "+91 98765 43210" or "098765 43210" keeps its last 10 digits rather than being cut short.
 */
function toIndianNational(value: string) {
  const digits = value.replace(/\D/g, '')
  // Only exact "91 + 10 digits" or "0 + 10 digits" are prefixes: an extra digit typed after a number
  // that itself starts with 91 is ignored rather than shifting the number.
  const hasPrefix = (digits.length === indianDigits + 2 && digits.startsWith('91')) || (digits.length === indianDigits + 1 && digits.startsWith('0'))
  return hasPrefix ? digits.slice(-indianDigits) : digits.slice(0, indianDigits)
}

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
  const isIndia = country.code === 'IN'
  const e164 = national.trim() ? toE164(country, national) : ''

  useEffect(() => {
    const problem = !national.trim() ? ''
      : isIndia && national.length !== indianDigits ? `Enter a 10-digit mobile number (${national.length} entered).`
      : !isValidPhone(e164) ? `Enter a valid ${country.name} number (+${country.dialCode}).`
      : ''
    inputRef.current?.setCustomValidity(problem)
  }, [e164, country, isIndia, national])

  // Switching to India trims whatever was typed for another country to the Indian format.
  function selectCountry(next: DialCountry) {
    setCountry(next)
    if (next.code === 'IN') setNational((current) => toIndianNational(current))
  }

  return (
    <div className="phone-field">
      <label htmlFor={inputId}>{label}{hint && <span> {hint}</span>}</label>
      <div className="phone-input">
        <CountryCombobox options={dialCountries} selected={country} onSelect={selectCountry} label="Country code" optionDetail={dialDetail} selectedText={dialDetail} className="phone-country" />
        <input ref={inputRef} id={inputId} type="tel" inputMode={isIndia ? 'numeric' : 'tel'} autoComplete="tel-national" required={required} value={national} onChange={(event) => setNational(isIndia ? toIndianNational(event.target.value) : event.target.value)} placeholder={isIndia ? 'e.g. 9876543210' : 'Phone number'} />
      </div>
      <input type="hidden" name={name} value={e164} />
    </div>
  )
}
