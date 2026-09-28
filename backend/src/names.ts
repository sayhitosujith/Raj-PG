/** Proper capitals for a name typed all lower or upper case; mixed case is kept as typed. Mirrors the web app's displayName. */
export function displayName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) return trimmed
  return trimmed.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase())
}
