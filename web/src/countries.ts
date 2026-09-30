import flagIconCountries from 'flag-icons/country.json'

/** A country the nationality picker offers: its ISO 3166-1 alpha-2 code, upper-case as the API stores it. */
export type Country = { code: string; name: string }

/**
 * Every country flag-icons can draw, A–Z by name. Its list also holds sub-national regions and
 * organisations (England, EU, UN), which are not nationalities, hence the `iso` filter; the API's
 * country set is generated from the same entries.
 */
export const countries: Country[] = flagIconCountries
  .filter((country) => country.iso)
  .map((country) => ({ code: country.code.toUpperCase(), name: country.name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
