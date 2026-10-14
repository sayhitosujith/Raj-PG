const capitaliseWords = (name: string) => name.replace(/(^|[\s'-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase())

/** Every word of a name starting with a capital; capitals inside a mixed-case word ("McDonald") are kept. Mirrors the web app's displayName. */
export function displayName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const isSingleCase = trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase()
  return capitaliseWords(isSingleCase ? trimmed.toLowerCase() : trimmed)
}
