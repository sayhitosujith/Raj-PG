import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Loose email shape check (something@domain.tld); shared so every form accepts the same addresses. */
export function isValidEmail(value: string) {
  return emailPattern.test(value)
}

/** Why a phone number was rejected; shared so every form explains it the same way. */
export const phoneRequirement = 'Enter a valid phone number: 10 digits for India, or the full number with its country code (e.g. +44 7911 123456).'

/**
 * A phone number in E.164 form ("+919876543210"), or null when it is not a valid number for its
 * country. Numbers without a country code are read as Indian, which keeps plain 10-digit input
 * (and "0…"/"91…" spellings) working. Uses the full metadata so validity is checked per country.
 */
export function normalizePhone(value: string) {
  const parsed = parsePhoneNumberFromString(value.trim(), 'IN')
  return parsed?.isValid() ? parsed.number : null
}

/**
 * The digit strings a stored copy of an E.164 number may have: its digits, and for an Indian
 * number the bare 10 digits that rows written before E.164 storage (or by an older deploy) hold.
 * Compare against `regexp_replace(phone, '\D', '', 'g')` to match either.
 */
export function phoneDigitVariants(e164: string): [string, string] {
  const digits = e164.slice(1)
  return [digits, e164.startsWith('+91') ? e164.slice(3) : digits]
}

const upiIdPattern = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/

/** A UPI ID (VPA) shape check: handle@provider, e.g. rajpg@okhdfcbank or 9876543210@ybl. */
export function isValidUpiId(value: string) {
  return upiIdPattern.test(value)
}
