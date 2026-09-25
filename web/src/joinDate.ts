// Joining dates are date-only values that arrive as "YYYY-MM-DDT00:00:00.000Z". Only the
// calendar day is used, so a resident who joined on the 25th never shows as the 24th in a
// time zone behind UTC.
const msPerDay = 24 * 60 * 60 * 1000

function calendarParts(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return { year, month, day }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Today's local date as `YYYY-MM-DD`, the format a date input expects. */
export function todayDateInputValue(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}

/** Formats a joining date for display, e.g. "25 Sept 2026". */
export function formatJoinDate(value: string) {
  const { year, month, day } = calendarParts(value)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Whole calendar days from the joining date to today; negative for a future move-in. */
export function daysSince(value: string, now = new Date()) {
  const { year, month, day } = calendarParts(value)
  return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / msPerDay)
}

/** Whole days between the joining date and today: "Joined today", "45 days", or "Joins in 3 days". */
export function daysStayedLabel(value: string, now = new Date()) {
  const days = daysSince(value, now)
  if (days === 0) return 'Joined today'
  return days < 0 ? `Joins in ${plural(-days, 'day')}` : plural(days, 'day')
}
