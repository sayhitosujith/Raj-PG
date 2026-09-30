import { getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode, type PhoneNumber } from 'libphonenumber-js/min'
import metadata from 'libphonenumber-js/metadata.min.json'
import { countries, type Country } from './countries'

/** Numbers typed without a country code are Indian, matching the server's reading of them. */
export const defaultPhoneCountry = 'IN'

/** A country the phone picker offers, with its calling code ("91") and no "+". */
export type DialCountry = Country & { code: CountryCode; dialCode: string }

/** The countries that have a calling code (Antarctica and a few territories have none), A–Z. */
export const dialCountries: DialCountry[] = countries.flatMap((country) => isSupportedCountry(country.code) ? [{ ...country, code: country.code, dialCode: getCountryCallingCode(country.code) }] : [])

const findDialCountry = (code: string | undefined) => dialCountries.find((country) => country.code === code) ?? dialCountries.find((country) => country.code === defaultPhoneCountry)!

// A number whose range the metadata does not know has no country; falling back to India would
// mislabel it (and re-save it under +91), so the calling code's main country (listed first) is used.
const countryOf = (parsed: PhoneNumber) => parsed.country ?? metadata.country_calling_codes[parsed.countryCallingCode]?.[0]

/**
 * Splits a stored number ("+447911123456", or a legacy bare "9876543210") into the picker's
 * country and the number as typed within that country, for editing.
 */
export function splitPhone(value: string): { country: DialCountry; national: string } {
  const parsed = value.trim() ? parsePhoneNumberFromString(value, defaultPhoneCountry) : undefined
  if (!parsed) return { country: findDialCountry(defaultPhoneCountry), national: value.replace(/\D/g, '') }
  return { country: findDialCountry(countryOf(parsed)), national: parsed.nationalNumber }
}

/**
 * A stored number for display: its country's ISO code (for the flag) and the number grouped the
 * way that country writes it ("+91 94808 60587"). Unparseable values are shown as stored.
 */
export function describePhone(value: string): { countryCode: string | undefined; international: string } {
  const parsed = parsePhoneNumberFromString(value, defaultPhoneCountry)
  return parsed ? { countryCode: countryOf(parsed), international: parsed.formatInternational() } : { countryCode: undefined, international: value }
}

/**
 * The number in E.164 form ("+447911123456") for a country and what was typed. Falls back to
 * joining the digits when it cannot be parsed, so the server still receives it and explains why
 * it is invalid.
 */
export function toE164(country: DialCountry, national: string) {
  const parsed = parsePhoneNumberFromString(national, country.code)
  return parsed?.number ?? `+${country.dialCode}${national.replace(/\D/g, '').replace(/^0+/, '')}`
}

/** Whether an E.164 number is valid for its country (lengths only; the server checks fully). */
export function isValidPhone(e164: string) {
  return parsePhoneNumberFromString(e164)?.isValid() ?? false
}
