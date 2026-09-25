import { Coffee, Moon, Soup } from 'lucide-react'

export type Meal = 'breakfast' | 'lunch' | 'dinner'

/** A property's meal windows, 24-hour "HH:MM" local times, as the API sends them. */
export type MealTimes = Record<Meal, { from: string; to: string }>

/** Used when a property has no timings yet (e.g. the offline sample dashboard); matches the server defaults. */
export const defaultMealTimes: MealTimes = { breakfast: { from: '07:30', to: '09:30' }, lunch: { from: '12:30', to: '14:30' }, dinner: { from: '19:30', to: '21:30' } }

/** Meals in serving order, with how they are labelled on both sides. */
export const mealDetails: Array<{ meal: Meal; label: string; icon: typeof Coffee }> = [
  { meal: 'breakfast', label: 'Breakfast', icon: Coffee },
  { meal: 'lunch', label: 'Lunch', icon: Soup },
  { meal: 'dinner', label: 'Dinner', icon: Moon },
]

const toMinutes = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }

function formatClock(time: string, withPeriod: boolean) {
  const [hours, minutes] = time.split(':').map(Number)
  const clock = `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
  return withPeriod ? `${clock} ${hours < 12 ? 'am' : 'pm'}` : clock
}

/** "7:30 – 9:30 am", or "11:30 am – 1 pm" when the window crosses noon. */
export function formatMealWindow({ from, to }: { from: string; to: string }) {
  const samePeriod = (toMinutes(from) < 720) === (toMinutes(to) < 720)
  return `${formatClock(from, !samePeriod)} – ${formatClock(to, true)}`
}

/** Which meal is being served now, and which comes next (breakfast again after dinner). */
export function mealStatus(times: MealTimes, minutesIntoDay: number) {
  const serving = mealDetails.find(({ meal }) => minutesIntoDay >= toMinutes(times[meal].from) && minutesIntoDay < toMinutes(times[meal].to))?.meal
  const next = serving ? undefined : (mealDetails.find(({ meal }) => toMinutes(times[meal].from) > minutesIntoDay) ?? mealDetails[0]).meal
  return { serving, next }
}

/** Reads the MealTimingFields inputs (breakfastFrom, breakfastTo, ...) back into the API shape. */
export function readMealTimes(form: FormData): MealTimes {
  return Object.fromEntries(mealDetails.map(({ meal }) => [meal, { from: String(form.get(`${meal}From`) ?? ''), to: String(form.get(`${meal}To`) ?? '') }])) as MealTimes
}
