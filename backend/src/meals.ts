import type { Property } from '@prisma/client'

/** Meals in the order they are served; the key doubles as the column prefix (breakfastFrom, ...). */
export const meals = ['breakfast', 'lunch', 'dinner'] as const
type Meal = (typeof meals)[number]

/** A property's meal windows as the API exposes them, e.g. { breakfast: { from: '07:30', to: '09:30' } }. */
export type MealTimes = Record<Meal, { from: string; to: string }>
type MealColumns = Pick<Property, `${Meal}From` | `${Meal}To`>

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const labels: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

/** Selects only the six meal columns, so reading meal times never loads the property's photo. */
export const mealColumnsSelect = { breakfastFrom: true, breakfastTo: true, lunchFrom: true, lunchTo: true, dinnerFrom: true, dinnerTo: true } satisfies Record<keyof MealColumns, true>

/** Groups the six stored columns into the API shape. */
export function toMealTimes(property: MealColumns): MealTimes {
  return Object.fromEntries(meals.map((meal) => [meal, { from: property[`${meal}From`], to: property[`${meal}To`] }])) as MealTimes
}

/**
 * Validates an owner's meal timings: every meal needs a 24-hour HH:MM start before its end.
 * All three are required together so a property never ends up with half-set timings.
 */
export function parseMealTimes(value: unknown): { data: MealColumns } | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'Meal timings are missing.' }
  const input = value as Partial<Record<Meal, { from?: unknown; to?: unknown }>>
  const data = {} as MealColumns
  for (const meal of meals) {
    const { from, to } = input[meal] ?? {}
    if (typeof from !== 'string' || typeof to !== 'string' || !timePattern.test(from) || !timePattern.test(to)) return { error: `${labels[meal]} needs a start and end time.` }
    // Zero-padded 24-hour times compare correctly as strings.
    if (from >= to) return { error: `${labels[meal]} must start before it ends.` }
    data[`${meal}From`] = from
    data[`${meal}To`] = to
  }
  return { data }
}
