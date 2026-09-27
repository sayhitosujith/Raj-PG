/**
 * A person's name for display: "sujith sadashivareddy" or "SUJITH SADASHIVAREDDY" becomes
 * "Sujith Sadashivareddy". Names typed in mixed case ("McDonald", "D'Souza") are left as typed,
 * since the owner capitalised them deliberately. The stored name is never changed.
 */
export function displayName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const isSingleCase = trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase()
  if (!isSingleCase) return trimmed
  return trimmed.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase())
}
