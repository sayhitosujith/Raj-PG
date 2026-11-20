import type { AttendanceStatus } from '@prisma/client'
import { onRollCall } from './attendance.js'
import { nightlyRows, weekLabel, weekNights } from './attendanceWeek.js'
import { propertyNow } from './dates.js'
import { prisma } from './db.js'
import { isEmailAddress, isEmailEnabled, sendEmail } from './emailClient.js'
import { weeklyAttendanceEmail } from './emailTemplates.js'
import { displayName } from './names.js'
import { isResidentFeatureOn } from './residentFeatures.js'
import { getSettings } from './settings.js'

/**
 * The weekly attendance email: each resident's emergency contact gets the roll call of the last full
 * Sunday-to-Saturday week (weekNights). An external cron calls it on Sunday evening (see cronRouter). Each
 * resident's week is recorded in AttendanceReport only after the email went out, so a retried or
 * duplicate call skips those already sent and retries only the ones that failed.
 */
export async function runWeeklyAttendance(now = new Date()) {
  if (!isEmailEnabled()) return { skipped: 'Email is not configured.' }
  const settings = await getSettings()
  if (!isResidentFeatureOn(settings.residentFeatures, 'attendanceReport')) return { skipped: 'The weekly attendance email is switched off in Resident features.' }
  const nights = weekNights(propertyNow(now).date)
  const weekStart = new Date(`${nights[0]}T00:00:00Z`)
  const weekEnd = new Date(`${nights[6]}T00:00:00Z`)
  const week = weekLabel(nights)
  const residents = await prisma.resident.findMany({ where: { ...onRollCall, emergencyContactEmail: { not: null }, attendanceReports: { none: { weekStart } } }, select: { id: true, name: true, bedNumber: true, emergencyContactEmail: true, room: { select: { number: true, property: { select: { name: true } } } }, attendanceMarks: { where: { date: { gte: weekStart, lte: weekEnd } }, select: { date: true, status: true } } } })
  const counts = { checked: residents.length, sent: 0, skipped: 0, failed: 0 }
  for (const resident of residents) {
    const to = resident.emergencyContactEmail
    if (!isEmailAddress(to)) { counts.skipped += 1; continue }
    try {
      const marks = new Map<string, AttendanceStatus>(resident.attendanceMarks.map((mark) => [mark.date.toISOString().slice(0, 10), mark.status]))
      const room = `room ${resident.room?.number ?? '—'}${resident.bedNumber ? `, bed ${resident.bedNumber}` : ''}`
      await sendEmail({ to, ...weeklyAttendanceEmail({ business: settings.businessName, name: displayName(resident.name), property: resident.room?.property.name ?? '', room, week, nights: nightlyRows(nights, marks) }) })
      await prisma.attendanceReport.create({ data: { residentId: resident.id, weekStart } })
      counts.sent += 1
    } catch (error) {
      console.error(`Weekly attendance email for resident ${resident.id} failed:`, error)
      counts.failed += 1
    }
  }
  return { week: nights[0], ...counts }
}
