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

/** "October 2026" from a "YYYY-MM" month key, as receipts and messages write it. */
export function formatMonthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' })
}
