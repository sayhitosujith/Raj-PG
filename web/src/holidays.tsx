import { useEffect, useState } from 'react'
import { PartyPopper } from 'lucide-react'
import { todayDateInputValue } from './joinDate'

/** A public holiday from the server (Google's India calendar, observances left out). */
export type Holiday = { date: string; name: string }

/** Upcoming holidays from `url` (the admin or resident endpoint); empty while loading or if it fails. */
export function useHolidays(url: string) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  useEffect(() => {
    let isCurrent = true
    fetch(url).then((response) => (response.ok ? response.json() as Promise<{ holidays: Holiday[] }> : null)).then((body) => { if (isCurrent && body) setHolidays(body.holidays) }, () => undefined)
    return () => { isCurrent = false }
  }, [url])
  return holidays
}

/** The holiday (or holidays, joined) on a "YYYY-MM-DD" date, or null. */
export function holidayOn(holidays: Holiday[], date: string) {
  const names = holidays.filter((holiday) => holiday.date === date).map((holiday) => holiday.name)
  return names.length ? names.join(' · ') : null
}

// Dates are calendar days, so they are read and formatted in UTC to avoid shifting by time zone.
const asDate = (date: string) => new Date(`${date}T00:00:00Z`)
const daysUntil = (date: string) => Math.round((asDate(date).getTime() - asDate(todayDateInputValue()).getTime()) / 86_400_000)

function whenLabel(date: string) {
  const days = daysUntil(date)
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
}

/**
 * The next few public holidays as date tiles ("20 OCT · Dussehra · Tuesday · In 18 days"), shared by
 * the resident portal and the owner's overview. Shows a short note when there are none to list.
 */
export function HolidayList({ holidays, limit = 5 }: { holidays: Holiday[]; limit?: number }) {
  if (!holidays.length) return <p className="holiday-empty">No public holidays coming up, or the holiday calendar is unavailable right now.</p>
  return (
    <ul className="holiday-list">
      {holidays.slice(0, limit).map((holiday) => {
        const date = asDate(holiday.date)
        const isToday = daysUntil(holiday.date) === 0
        return (
          <li key={`${holiday.date}-${holiday.name}`} className={isToday ? 'is-today' : undefined}>
            <span className="holiday-date"><strong>{date.getUTCDate()}</strong><small>{date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</small></span>
            <span className="holiday-copy"><strong>{holiday.name}</strong><small>{date.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })} · {whenLabel(holiday.date)}</small></span>
            {isToday && <PartyPopper size={16} className="holiday-today-icon" aria-label="Today" />}
          </li>
        )
      })}
    </ul>
  )
}
