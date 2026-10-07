import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, IndianRupee } from 'lucide-react'
import { formatDueDate, formatMonth, formatRupees, ordinal, type RentSummary } from './rent'

/** Which of the three reminders the resident is on, or null outside the reminder days. */
const reminderNumber = (rent: RentSummary) => ({ REMINDER_1: 1, REMINDER_2: 2, REMINDER_3: 3 } as Partial<Record<RentSummary['state'], number>>)[rent.state] ?? null

// Overdue rent locks the resident out at midnight IST after the due day (see the backend's rentLock.ts).
const istOffsetMs = 5.5 * 60 * 60 * 1000
const lockTime = (rent: RentSummary) => Date.UTC(Number(rent.currentMonth.slice(0, 4)), Number(rent.currentMonth.slice(5, 7)) - 1, rent.dueDay + 1) - istOffsetMs

function formatCountdown(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

/** "Your access will be blocked in 6 h 32 min" on the final reminder, ticking down each half minute. */
function LockCountdown({ rent }: { rent: RentSummary }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const remaining = lockTime(rent) - now
  if (remaining <= 0) return null
  return <span className="rent-lock-countdown"><Clock size={13} /> Your access will be blocked in <b>{formatCountdown(remaining)}</b> unless rent is paid.</span>
}

/**
 * Prominent monthly rent card for the resident's "My details": amount, due day, this month's state,
 * and on reminder days the reminder itself (with the lock countdown on the last one) under its chip.
 */
export function RentHighlight({ rent }: { rent: RentSummary }) {
  if (!rent.monthlyRent) return null
  const status = rent.state === 'LOCK_DUE' ? { label: `Overdue · ${formatRupees(rent.amountDue)}`, tone: 'coral' }
    : rent.state === 'PAID' ? { label: `${formatMonth(rent.currentMonth)} paid`, tone: 'sage' }
    : rent.outstandingMonths.length ? { label: `Due by ${formatDueDate(rent.outstandingMonths[0], rent.dueDay)}`, tone: 'gold' }
    : { label: 'Nothing due yet', tone: 'muted' }
  const reminder = reminderNumber(rent)
  return (
    // The amount itself turns red while any month is unpaid and green when nothing is owed.
    <div className={`rent-highlight is-${status.tone} ${rent.outstandingMonths.length ? 'is-due' : 'is-clear'}`}>
      <span className="rent-highlight-icon"><IndianRupee size={20} /></span>
      <div className="rent-highlight-copy">
        <p className="eyebrow">Monthly rent</p>
        <strong>{formatRupees(rent.monthlyRent)}<small> / month</small></strong>
        <span>Due by the {ordinal(rent.dueDay)} of every month</span>
      </div>
      <div className="rent-highlight-side">
        <div className="rent-highlight-badges">
          {reminder && <span className="rent-highlight-status gold">Reminder {reminder} of 3</span>}
          <span className={`rent-highlight-status ${status.tone}`}>{status.label}</span>
        </div>
        {reminder && <div className="rent-highlight-reminder" role="status">
          {reminder === 3 && <LockCountdown rent={rent} />}
          <p>{formatRupees(rent.monthlyRent)} for {formatMonth(rent.currentMonth)} is due by {formatDueDate(rent.currentMonth, rent.dueDay)}.{reminder === 3 ? ' This is the last reminder.' : ''}{rent.lateFee ? ` A late fee of ${formatRupees(rent.lateFee)} applies after that.` : ''} Please pay your property owner.</p>
        </div>}
      </div>
    </div>
  )
}

/**
 * The overdue notice at the top of the portal (seen only while the owner allows access despite
 * overdue rent). Reminders show inside the rent card instead. `action` (e.g. Pay online) sits at the end.
 */
export function RentBanner({ rent, action }: { rent: RentSummary; action?: ReactNode }) {
  if (!rent.monthlyRent) return null
  if (rent.state === 'LOCK_DUE') {
    return (
      <div className="rent-banner is-overdue" role="alert">
        <AlertTriangle size={18} />
        <div><strong>Your rent is overdue</strong><p>{formatRupees(rent.amountDue)} outstanding for {rent.overdueMonths.map(formatMonth).join(', ')}{rent.lateFee ? ', including late fees' : ''}. Please pay your property owner today. Your property owner has kept your access open for now; until the payment is recorded, new housekeeping requests are paused, and once that extension ends you will be signed out.</p></div>
        {action}
      </div>
    )
  }
  return null
}
