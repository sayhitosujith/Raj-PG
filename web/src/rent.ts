/** Where a resident stands for rent, computed by the server in India time (see backend rent.ts). */
export type RentState = 'NOT_TRACKED' | 'NOT_DUE' | 'PAID' | 'REMINDER_1' | 'REMINDER_2' | 'LOCK_DUE'
/** razorpayPaymentId is set for online payments; null when the owner recorded it. */
export type RentPaymentRecord = { id: string; month: string; amount: number; paidAt: string; razorpayPaymentId?: string | null }

/** A resident's rent position; months are "YYYY-MM", amounts whole rupees. amountDue includes late fees. */
export type RentSummary = { state: RentState; monthlyRent: number | null; currentMonth: string; outstandingMonths: string[]; overdueMonths: string[]; amountDue: number; dueDay: number; lateFee: number; payments: RentPaymentRecord[] }

/** "October 2026" from "2026-10". */
export function formatMonth(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Whole rupees with Indian grouping, e.g. "₹12,500". */
export const formatRupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th". */
export function ordinal(day: number) {
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'
  return `${day}${suffix}`
}

/** "2 Oct" — the due date for a month. */
export function formatDueDate(month: string, dueDay: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, dueDay).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Row badge for states that need attention; null when there is nothing to flag. */
export const rentBadges: Record<RentState, { label: string; tone: string } | null> = {
  NOT_TRACKED: null,
  NOT_DUE: null,
  PAID: null,
  REMINDER_1: { label: 'Rent reminder 1', tone: 'gold' },
  REMINDER_2: { label: 'Rent reminder 2', tone: 'gold' },
  LOCK_DUE: { label: 'Rent overdue · access lock due', tone: 'coral' },
}

/** Always-visible one-line rent state for a resident row, so rent is not hidden behind "expand". */
export function rentChip(rent: RentSummary): { text: string; tone: string } {
  if (!rent.monthlyRent) return { text: 'Rent not set', tone: 'muted' }
  const amount = formatRupees(rent.monthlyRent)
  switch (rent.state) {
    case 'LOCK_DUE': return { text: `${formatRupees(rent.amountDue)} overdue`, tone: 'coral' }
    case 'REMINDER_2':
    case 'REMINDER_1': return { text: `${amount} · due ${formatDueDate(rent.currentMonth, rent.dueDay)}`, tone: 'gold' }
    case 'PAID': return { text: `${amount} · paid`, tone: 'sage' }
    case 'NOT_TRACKED': return { text: `${amount} · paused`, tone: 'muted' }
    default: return { text: `${amount} · due ${formatDueDate(nextMonthToRecord(rent), rent.dueDay)}`, tone: 'muted' }
  }
}

/**
 * The month "Mark paid" will record: the oldest unpaid one, else next month (advance). Every billed
 * month up to now is in outstandingMonths, so when that is empty this month is either paid or was
 * never billed (moved in after the due day) — either way the next rent is next month's.
 * Mirrors rentItemsToPay on the server.
 */
export function nextMonthToRecord(rent: RentSummary) {
  if (rent.outstandingMonths.length) return rent.outstandingMonths[0]
  // Skip months already paid in advance; the recent payments include them, being the latest.
  const paid = new Set(rent.payments.map((payment) => payment.month))
  let month = monthAfter(rent.currentMonth)
  while (paid.has(month)) month = monthAfter(month)
  return month
}

function monthAfter(key: string) {
  const [year, month] = key.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}
