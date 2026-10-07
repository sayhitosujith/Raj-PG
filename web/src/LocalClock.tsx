import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { propertyTimeZone } from './propertyTime'
import { TodayTile } from './TodayTile'

/**
 * A short zone name such as IST, EST, EDT or BST. Browsers only give real abbreviations in some
 * locales (en-US for American zones, en-IN for IST, en-GB for UK), so each is tried before
 * falling back to the "GMT+5:30" form.
 */
function zoneAbbreviation(timeZone: string, date: Date) {
  const names = ['en-US', 'en-IN', 'en-GB'].map((locale) => new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? '')
  return names.find((name) => name && !/^(GMT|UTC)/.test(name)) ?? names[0]
}

const timeIn = (timeZone: string, date: Date) => `${date.toLocaleTimeString('en-IN', { timeZone, hour: 'numeric', minute: '2-digit' })} ${zoneAbbreviation(timeZone, date)}`

/**
 * The property's local time (IST), which the meal and housekeeping times are in, as a today tile;
 * hovering shows the viewer's own time when their device is set to another zone. Refreshes each minute.
 */
export function LocalClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Tick on the minute boundary, then every minute, so the clock never lags a minute behind.
    let interval: number | undefined
    const timeout = window.setTimeout(() => { setNow(new Date()); interval = window.setInterval(() => setNow(new Date()), 60_000) }, 60_000 - (Date.now() % 60_000))
    return () => { window.clearTimeout(timeout); window.clearInterval(interval) }
  }, [])
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const isAway = Boolean(viewerZone) && timeIn(viewerZone, now) !== timeIn(propertyTimeZone, now)
  return <TodayTile kind="time" icon={<Clock size={16} />} label="Local time" value={timeIn(propertyTimeZone, now)} title={isAway ? `Your time: ${timeIn(viewerZone, now)}` : undefined} />
}
