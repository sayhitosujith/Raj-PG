const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Loose email shape check (something@domain.tld); shared so every form accepts the same addresses. */
export function isValidEmail(value: string) {
  return emailPattern.test(value)
}

/**
 * An Indian mobile number as its 10 digits, or null when it is not one. Accepts the ways people
 * type it (+91 or 0 prefix, spaces, dashes); sign-in matches on the last 10 digits, so storing
 * just those keeps old and new records comparable.
 */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits
  return /^\d{10}$/.test(local) ? local : null
}
