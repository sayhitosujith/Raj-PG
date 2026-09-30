import { countries } from './countries'

// Flags are referenced by URL instead of through flag-icons' stylesheet, which would put every flag
// into the app-wide CSS that residents download too.
const flagDirectory = '/node_modules/flag-icons/flags/4x3/'
const flagUrls = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default', eager: true })

/** A country's flag as a decorative image; `code` is an ISO 3166-1 alpha-2 code in either case. */
export function Flag({ code }: { code: string }) {
  return <img className="country-flag" src={flagUrls[`${flagDirectory}${code.toLowerCase()}.svg`]} alt="" width={20} height={15} loading="lazy" />
}

/** A country's flag and English name, for read-only display; falls back to the bare code if unknown. */
export function CountryLabel({ code }: { code: string }) {
  const country = countries.find((candidate) => candidate.code === code)
  return <span className="country-label">{country && <Flag code={country.code} />}{country?.name ?? code}</span>
}
