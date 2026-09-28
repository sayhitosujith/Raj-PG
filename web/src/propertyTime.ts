/** Properties are in India, so meal, housekeeping and rent times are all IST. */
export const propertyTimeZone = 'Asia/Kolkata'

/** Minutes since midnight at the property, whatever time zone the viewer's device is in. */
export function propertyMinutesIntoDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: propertyTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const value = (type: 'hour' | 'minute') => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return value('hour') * 60 + value('minute')
}
