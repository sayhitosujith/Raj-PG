import { toMinutes } from './meals'

/**
 * Whether the gate is open right now (IST minutes into the day), from the owner's opening and closing times, or null
 * when either time is missing. A closing time earlier than the opening one means the gate stays open past midnight.
 * Informational only: the app does not drive the lock, so the lock's own schedule must match these times.
 */
export function isGateOpen(opening: string | null | undefined, closing: string | null | undefined, minutesIntoDay: number) {
  if (!opening || !closing) return null
  const [from, to] = [toMinutes(opening), toMinutes(closing)]
  if (from === to) return true
  return from < to ? minutesIntoDay >= from && minutesIntoDay < to : minutesIntoDay >= from || minutesIntoDay < to
}
