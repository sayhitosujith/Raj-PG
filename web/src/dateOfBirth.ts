import { formatJoinDate, todayDateInputValue } from './joinDate'

/**
 * Whole years since a date of birth ("YYYY-MM-DD…"), or null when none was given. Counted on calendar days, so a
 * birthday today already counts.
 */
export function ageFrom(value: string | null | undefined) {
  if (!value) return null
  const born = value.slice(0, 10)
  const today = todayDateInputValue()
  return Number(today.slice(0, 4)) - Number(born.slice(0, 4)) - (today.slice(5) < born.slice(5) ? 1 : 0)
}

/**
 * A date of birth for display, with the age beside it ("12 Mar 2001 · 25 yrs"), shared by the owner's resident
 * details and the resident's own profile; "—" when none was given.
 */
export function formatDateOfBirth(value: string | null | undefined) {
  const age = ageFrom(value)
  if (!value || age === null) return '—'
  return `${formatJoinDate(value.slice(0, 10))} · ${age} ${age === 1 ? 'yr' : 'yrs'}`
}
