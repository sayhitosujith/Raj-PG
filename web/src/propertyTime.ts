/** Properties are in India, so meal, housekeeping and rent times are all IST. */
export const propertyTimeZone = 'Asia/Kolkata'

/** Minutes since midnight at the property, whatever time zone the viewer's device is in. */
export function propertyMinutesIntoDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: propertyTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const value = (type: 'hour' | 'minute') => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return value('hour') * 60 + value('minute')
}

/** Today's date at the property as "YYYY-MM-DD", so a staff phone set to another time zone still picks the right night. */
export function propertyToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: propertyTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
