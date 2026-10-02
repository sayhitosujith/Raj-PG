import { Router } from 'express'
import { propertyNow } from './dates.js'

/**
 * Indian public holidays from Google's public "Holidays in India" calendar (an iCal feed, no key
 * needed). It also lists observances (festival eves and the like); those are dropped so only days
 * marked "Public holiday" show. The list is national, not a state's RBI bank-holiday list.
 */
const feedUrl = 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics'
const cacheMs = 24 * 60 * 60 * 1000
// A failed fetch is retried after an hour rather than on every page load.
const failureCacheMs = 60 * 60 * 1000
const fetchTimeoutMs = 8000

/** One public holiday: "YYYY-MM-DD" and its name, e.g. { date: '2026-10-20', name: 'Dussehra' }. */
export type Holiday = { date: string; name: string }

let cache: { expiresAt: number; holidays: Holiday[] } | null = null

// iCal escapes commas, semicolons and backslashes in text and folds long lines with a leading space.
const unescapeText = (value: string) => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()

function parseFeed(ics: string): Holiday[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '')
  const holidays = unfolded.split('BEGIN:VEVENT').slice(1).flatMap((event) => {
    const date = event.match(/^DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/m)
    const name = event.match(/^SUMMARY:(.*)$/m)?.[1]
    const description = event.match(/^DESCRIPTION:(.*)$/m)?.[1] ?? ''
    if (!date || !name || !/^Public holiday/i.test(description)) return []
    return [{ date: `${date[1]}-${date[2]}-${date[3]}`, name: unescapeText(name) }]
  })
  return holidays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

async function loadHolidays() {
  if (cache && cache.expiresAt > Date.now()) return cache.holidays
  let holidays: Holiday[] = []
  try {
    const response = await fetch(feedUrl, { signal: AbortSignal.timeout(fetchTimeoutMs) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    holidays = parseFeed(await response.text())
  } catch (error) {
    console.warn('[holidays] Calendar fetch failed:', error instanceof Error ? error.message : error)
  }
  cache = { expiresAt: Date.now() + (holidays.length ? cacheMs : failureCacheMs), holidays }
  return holidays
}

/** Public holidays from today (IST) through the next `days` days; empty when the feed is unreachable. */
export async function upcomingHolidays(days = 120) {
  const today = propertyNow().date
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return (await loadHolidays()).filter((holiday) => holiday.date >= today && holiday.date <= end)
}

/** GET /holidays for the owner's dashboard; residents use /resident-portal/holidays. */
export const holidaysAdminRouter = Router()

holidaysAdminRouter.get('/holidays', async (_request, response) => {
  response.json({ holidays: await upcomingHolidays() })
})
