const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses a date-only `YYYY-MM-DD` value (joining dates, housekeeping dates). Stored at UTC
 * midnight in DATE columns so the calendar day never shifts with time zones. Returns undefined
 * when absent, null when invalid.
 */
export function parseDateOnly(value: string | undefined) {
  if (!value) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  // Round-tripping rejects impossible dates like 2026-02-30, which Date would silently roll over.
  return isoDatePattern.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

/**
 * Properties are all in India (IST, UTC+5:30, no daylight saving), so a fixed offset turns local
 * dates and times into exact instants on any server.
 */
export const propertyUtcOffsetMs = 5.5 * 60 * 60 * 1000

/** The property-local calendar date ("YYYY-MM-DD") and minutes since local midnight right now. */
export function propertyNow(now = new Date()) {
  const local = new Date(now.getTime() + propertyUtcOffsetMs)
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() }
}

/** Midnight at the start of today in property time, as an exact instant (for "today" totals and day-long holds). */
export function propertyDayStart(now = new Date()) {
  return new Date(Date.parse(`${propertyNow(now).date}T00:00:00Z`) - propertyUtcOffsetMs)
}

/** The "YYYY-MM" month key after `key`; the one month-stepping rule for rent, orders, referrals and reports. */
export function monthAfter(key: string) {
  const [year, month] = key.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * A month's calendar-day range (for date-only columns such as Expense.date or Resident.joinedAt) and
 * its IST instant range (for timestamps such as paidAt or createdAt), both end-exclusive.
 */
export function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00Z`)
  const end = new Date(`${monthAfter(month)}-01T00:00:00Z`)
  return { start, end, istStart: new Date(start.getTime() - propertyUtcOffsetMs), istEnd: new Date(end.getTime() - propertyUtcOffsetMs) }
}

/** The IST "YYYY-MM" a timestamp falls in, so a payment at 1am IST on the 1st counts in the new month. */
export const istMonthKey = (instant: Date) => new Date(instant.getTime() + propertyUtcOffsetMs).toISOString().slice(0, 7)

/** "October 2026" from a "YYYY-MM" month key, as receipts and messages write it. */
export function formatMonthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' })
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", else the IST date ("12 Nov"), for activity lists. */
export function relativeTime(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  if (minutes < 48 * 60) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })
}
