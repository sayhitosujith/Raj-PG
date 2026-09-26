import type { Meal } from './meals'

/** One meal on one day as the resident sees it; the server decides what may be skipped or rated. */
export type ResidentMeal = { meal: Meal; from: string; to: string; items: string | null; skipped: boolean; canSkip: boolean; canRate: boolean; feedback: { liked: boolean; comment: string | null } | null }
export type ResidentMenuDay = { date: string; weekday: number; meals: ResidentMeal[] }

/** A week of the owner's menu; weekday is ISO (1 = Monday … 7 = Sunday), null = not set. */
export type MenuDay = { weekday: number } & Record<Meal, string | null>

export type FoodSummary = {
  residents: number
  headcounts: Array<{ date: string; meals: Array<{ meal: Meal; eating: number; skipping: number }> }>
  feedback: Array<{ id: string; date: string; meal: Meal; liked: boolean; comment: string | null; residentName: string }>
}

export const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const localDate = (iso: string) => { const [year, month, day] = iso.split('-').map(Number); return new Date(year, month - 1, day) }

/** "Today", "Tomorrow", or e.g. "Mon 28" for a date among the next few days. */
export function relativeDayLabel(iso: string, todayIso: string) {
  const days = Math.round((localDate(iso).getTime() - localDate(todayIso).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return localDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

/** "Sat, 26 Sep" for feedback rows. */
export const formatShortDate = (iso: string) => localDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
