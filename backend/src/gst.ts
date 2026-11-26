/**
 * A property's GST number (GSTIN): 2-digit state code, the 10-character PAN, the entity number, a
 * "Z", and a check character. The check character is verified so a mistyped number is caught when the
 * owner saves it, not when it is later printed on a receipt or invoice.
 */
const gstinPattern = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The GSTIN check character for the first 14 characters (the GSTN's base-36 weighted checksum). */
function checkCharacter(first14: string) {
  let sum = 0
  for (let index = 0; index < 14; index += 1) {
    const product = alphabet.indexOf(first14[index]) * (index % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return alphabet[(36 - (sum % 36)) % 36]
}

/** True for a well-formed GSTIN whose check character matches. Expects the normalised (upper-case) form. */
export function isValidGstin(gstin: string) {
  return gstinPattern.test(gstin) && checkCharacter(gstin.slice(0, 14)) === gstin[14]
}

/**
 * Parses the optional GST number from a property form. Absent leaves it alone, blank clears it;
 * spaces are dropped and letters upper-cased, since owners often copy it as "29 ABCDE1234F 1Z5".
 */
export function parseGstNumber(value: unknown): { gstNumber?: string | null } | { error: string } {
  if (value === undefined) return {}
  if (value !== null && typeof value !== 'string') return { error: 'GST number must be text.' }
  const gstin = (value ?? '').replace(/\s+/g, '').toUpperCase()
  if (!gstin) return { gstNumber: null }
  if (gstin.length !== 15 || !gstinPattern.test(gstin)) return { error: 'GST number must be 15 characters, like 29ABCDE1234F1ZW.' }
  if (!isValidGstin(gstin)) return { error: 'This GST number does not look right. Check it for a typo.' }
  return { gstNumber: gstin }
}
