import type { AttendanceStatus } from '@prisma/client'

/**
 * Pure date and wording rules for the nightly roll call and its weekly email, kept free of the database
 * so they can be checked on their own. Nights are IST calendar dates as "YYYY-MM-DD" (see dates.ts).
 */
const msPerDay = 24 * 60 * 60 * 1000

export const attendanceStatuses: readonly AttendanceStatus[] = ['PRESENT', 'AWAY', 'ON_LEAVE']

/** Narrows a request value to a status, so anything else is refused rather than stored. */
export const isAttendanceStatus = (value: unknown): value is AttendanceStatus => typeof value === 'string' && (attendanceStatuses as readonly string[]).includes(value)

/**
 * The seven nights, Sunday to Saturday, before the most recent Sunday on or before `isoDate`. The email goes out on
 * Sunday evening, before that night's roll call is taken, so it covers the last full Sunday–Saturday instead of a
 * week whose final night is still unrecorded. Any day of the following week maps to the same nights, so a late or
 * repeated run reports (and de-duplicates against) the same week.
 */
export function weekNights(isoDate: string) {
  const day = new Date(`${isoDate}T00:00:00Z`)
  const start = day.getTime() - (day.getUTCDay() + 7) * msPerDay
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * msPerDay).toISOString().slice(0, 10))
}

/** Words for one night; a night nobody saved is "Not recorded", never assumed present. */
export function attendanceLabel(status: AttendanceStatus | null | undefined) {
  return status === 'PRESENT' ? 'Present' : status === 'AWAY' ? 'Away' : status === 'ON_LEAVE' ? 'On leave' : 'Not recorded'
}

const formatNight = (isoDate: string, options: Intl.DateTimeFormatOptions) => new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...options })

/** "16 Nov – 22 Nov 2026", for the email's subject and heading. */
export const weekLabel = (nights: string[]) => `${formatNight(nights[0], { day: 'numeric', month: 'short' })} – ${formatNight(nights[nights.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`

/** Each night of the week as ["Mon, 16 Nov", "Present"], from the marks saved for it (keyed by date). */
export function nightlyRows(nights: string[], marks: ReadonlyMap<string, AttendanceStatus>): Array<[string, string]> {
  return nights.map((night) => [formatNight(night, { weekday: 'short', day: 'numeric', month: 'short' }), attendanceLabel(marks.get(night))])
}
