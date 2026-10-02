import { daysSince } from './joinDate'
import type { Resident } from './resident'

export type ResidentStatusFilter = 'all' | 'active' | 'inactive' | 'awaiting' | 'verification' | 'rent-overdue'
export type ResidentSort = 'recent' | 'longest' | 'name' | 'room'

/** Everything the Residents toolbar controls, kept as one value so "clear filters" is one assignment. */
export type ResidentQuery = { search: string; propertyId: string; status: ResidentStatusFilter; sort: ResidentSort }

/** The unfiltered view: every resident, most recently joined first. */
export const defaultResidentQuery: ResidentQuery = { search: '', propertyId: 'all', status: 'all', sort: 'recent' }

/** Residents whose Aadhaar the owner still has to act on (submitted and waiting for review). */
export function needsAadharReview(resident: Resident) {
  return resident.aadharStatus === 'PENDING'
}

/** Residents past the second rent reminder: flagged "access lock due" for the owner. */
export function isRentOverdue(resident: Resident) {
  return resident.rent.state === 'LOCK_DUE'
}

/** Active residents who have never replaced their access key with a password (and still have a key). */
export function isAwaitingSignIn(resident: Resident) {
  return resident.active && !resident.hasPassword && !resident.needsNewAccessKey
}

const statusMatchers: Record<ResidentStatusFilter, (resident: Resident) => boolean> = {
  all: () => true,
  active: (resident) => resident.active,
  inactive: (resident) => !resident.active,
  awaiting: isAwaitingSignIn,
  verification: needsAadharReview,
  'rent-overdue': isRentOverdue,
}

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// joinedAt strings are ISO dates, so string comparison is chronological order.
const sorters: Record<ResidentSort, (a: Resident, b: Resident) => number> = {
  recent: (a, b) => b.joinedAt.localeCompare(a.joinedAt),
  longest: (a, b) => a.joinedAt.localeCompare(b.joinedAt),
  name: (a, b) => naturalOrder.compare(a.name, b.name),
  room: (a, b) => naturalOrder.compare(a.room, b.room),
}

// Phone numbers are matched on digits only, so "98765 43210" finds "+919876543210".
function matchesSearch(resident: Resident, search: string) {
  const text = search.trim().toLowerCase()
  if (!text) return true
  const digits = text.replace(/\D/g, '')
  if (digits.length >= 3 && resident.phone?.replace(/\D/g, '').includes(digits)) return true
  return [resident.name, resident.email, resident.room, resident.property].some((field) => field?.toLowerCase().includes(text))
}

/** Applies the toolbar's search, filters, and sort without mutating the input list. */
export function applyResidentQuery(residents: Resident[], query: ResidentQuery) {
  return residents
    .filter((resident) => (query.propertyId === 'all' || resident.propertyId === query.propertyId) && statusMatchers[query.status](resident) && matchesSearch(resident, query.search))
    .sort(sorters[query.sort])
}

/** Summary tile figures. The average ignores residents who have not moved in yet. */
export function summarizeResidents(residents: Resident[], now = new Date()) {
  const active = residents.filter((resident) => resident.active)
  const stays = active.map((resident) => daysSince(resident.joinedAt, now)).filter((days) => days >= 0)
  return {
    active: active.length,
    inactive: residents.length - active.length,
    awaiting: residents.filter(isAwaitingSignIn).length,
    pendingVerification: residents.filter(needsAadharReview).length,
    rentOverdue: residents.filter(isRentOverdue).length,
    averageDaysStayed: stays.length ? Math.round(stays.reduce((sum, days) => sum + days, 0) / stays.length) : null,
  }
}
