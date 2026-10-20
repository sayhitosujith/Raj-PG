import type { Diet } from './diet'
import type { Meal } from './meals'

/**
 * One meal on one day as the resident sees it: their answer (null = not answered yet), whether they are
 * eating (no answer counts as not eating), and what the server allows: changing it until 9 pm the day
 * before, rating it once served.
 */
export type ResidentMeal = { meal: Meal; from: string; to: string; items: string | null; answer: boolean | null; eating: boolean; canChange: boolean; canRate: boolean; feedback: { liked: boolean; comment: string | null } | null; /** Past the cutoff, not eating and not started: may ask staff for it. */ canRequestLate: boolean; lateRequest: { status: LateMealStatus; staffNote: string | null; decidedByName: string | null } | null }

export type LateMealStatus = 'PENDING' | 'APPROVED' | 'DECLINED'

/** A late meal request as the Kitchen page lists it. */
export type LateMealRequest = { id: string; date: string; meal: Meal; status: LateMealStatus; staffNote: string | null; decidedAt: string | null; decidedByName: string | null; createdAt: string; residentName: string; room: string }
export type ResidentMenuDay = { date: string; weekday: number; meals: ResidentMeal[] }
/** The resident's next seven days, and tomorrow's date while its meals still need an answer before the cutoff. */
export type ResidentFood = { days: ResidentMenuDay[]; answerDue: string | null }

/** A week of the owner's menu; weekday is ISO (1 = Monday … 7 = Sunday), null = not set. */
export type MenuDay = { weekday: number } & Record<Meal, string | null>

/** A resident's answer for one meal on the Kitchen page (today or tomorrow); not opting in is NOT_EATING. */
export type TodayMealStatus = 'EATING' | 'NOT_EATING'

export type FoodSummary = {
  residents: number
  /** Per day and meal; notEating covers both a skip and no answer, since not opting in is a no. */
  headcounts: Array<{ date: string; meals: Array<{ meal: Meal; eating: number; /** Of those eating, how many are veg / non-veg; the rest have no diet set. */ veg: number; nonVeg: number; notEating: number }> }>
  feedback: Array<{ id: string; date: string; meal: Meal; liked: boolean; comment: string | null; residentName: string }>
  /**
   * Everyone on the food plan, in room order; diet null is Not set. `today` and `tomorrow` are their answers
   * per meal, counted as the headcount counts them; tomorrow's can still change until 9 pm tonight.
   */
  residentList: Array<{ id: string; name: string; phone: string | null; room: string; diet: Diet | null; today: Record<Meal, TodayMealStatus>; tomorrow: Record<Meal, TodayMealStatus> }>
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
