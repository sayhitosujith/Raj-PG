import { Flag } from './CountryFlag'
import { describePhone } from './phone'

/** A stored phone number with its country's flag, grouped for reading ("+91 94808 60587"). */
export function PhoneLabel({ value }: { value: string }) {
  const { countryCode, international } = describePhone(value)
  return <span className="phone-label">{countryCode && <Flag code={countryCode} />}{international}</span>
}
