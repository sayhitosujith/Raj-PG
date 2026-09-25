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
