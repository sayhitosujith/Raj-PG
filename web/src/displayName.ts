const capitaliseWords = (name: string) => name.replace(/(^|[\s'-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase())

/**
 * A person's name for display, every word starting with a capital: "sujith sadashivareddy" or
 * "SUJITH SADASHIVAREDDY" becomes "Sujith Sadashivareddy", and "vidhya Referral" becomes "Vidhya
 * Referral". In a mixed-case name only the first letters are raised; capitals inside a word
 * ("McDonald") are kept, since the owner typed them deliberately. The stored name is never changed.
 */
export function displayName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const isSingleCase = trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase()
  return capitaliseWords(isSingleCase ? trimmed.toLowerCase() : trimmed)
}
