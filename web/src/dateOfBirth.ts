import { formatJoinDate, todayDateInputValue } from './joinDate'

/**
 * A date of birth for display, with the age beside it ("12 Mar 2001 · 25 yrs"), shared by the owner's resident
 * details and the resident's own profile; "—" when none was given. The age is counted on calendar days, so a
 * birthday today already counts.
 */
export function formatDateOfBirth(value: string | null | undefined) {
  if (!value) return '—'
  const born = value.slice(0, 10)
  const today = todayDateInputValue()
  const age = Number(today.slice(0, 4)) - Number(born.slice(0, 4)) - (today.slice(5) < born.slice(5) ? 1 : 0)
  return `${formatJoinDate(born)} · ${age} ${age === 1 ? 'yr' : 'yrs'}`
}
