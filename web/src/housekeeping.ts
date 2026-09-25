/** Time windows a resident can pick; the hours are what both sides see, so they stay in one place. */
export type HousekeepingSlot = 'MORNING' | 'AFTERNOON' | 'EVENING'
export type HousekeepingStatus = 'REQUESTED' | 'SCHEDULED' | 'DONE' | 'CANCELLED'

/**
 * A request as the resident sees it. The timing fields are computed by the server (in the
 * property's time zone) so neither side's device clock or time zone decides them.
 */
export type HousekeepingRequest = { id: string; date: string; slot: HousekeepingSlot; note: string | null; status: HousekeepingStatus; ownerNote: string | null; createdAt: string; updatedAt: string; reminderCount: number; lastReminderAt: string | null; reminderAcknowledgedAt: string | null; slotStartsAt: string; slotEndsAt: string; isOverdue: boolean; hasOpenReminder: boolean; canRemindAt: string | null }

/** A request as the owner sees it, with who asked. */
export type OwnerHousekeepingRequest = HousekeepingRequest & { resident: { id: string; name: string; room: string; property: string; photoVersion: number | null } }

export const slotOptions: Array<{ value: HousekeepingSlot; label: string; hours: string }> = [
  { value: 'MORNING', label: 'Morning', hours: '8am – 12pm' },
  { value: 'AFTERNOON', label: 'Afternoon', hours: '12pm – 4pm' },
  { value: 'EVENING', label: 'Evening', hours: '4pm – 8pm' },
]

export const statusDetails: Record<HousekeepingStatus, { label: string; tone: string }> = {
  REQUESTED: { label: 'Requested', tone: 'gold' },
  SCHEDULED: { label: 'Scheduled', tone: 'blue' },
  DONE: { label: 'Done', tone: 'sage' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
}

/** Short local time, e.g. "10:32 am". */
export const formatTime = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Requests the owner still has to act on or complete. */
export const isOpenRequest = (request: HousekeepingRequest) => request.status === 'REQUESTED' || request.status === 'SCHEDULED'

/** e.g. "Sat, 27 Sept · Morning (8am – 12pm)"; the date is a calendar day, so it is read without time zone shifts. */
export function describeVisit(request: Pick<HousekeepingRequest, 'date' | 'slot'>) {
  const [year, month, day] = request.date.slice(0, 10).split('-').map(Number)
  const slot = slotOptions.find((option) => option.value === request.slot)
  const date = new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${date} · ${slot?.label ?? request.slot} (${slot?.hours ?? ''})`
}
