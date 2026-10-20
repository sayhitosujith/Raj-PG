import type { ReactNode } from 'react'
import { formatMealWindow, mealDetails, mealStatus, type Meal, type MealTimes } from './meals'

/** One of today's meals for a resident on the food plan: what it serves and whether they are eating it. */
export type TodayMeal = { items: string | null; eating: boolean }

/**
 * The resident's meal timings, highlighting the meal being served now or the next one. `menu`, when
 * given, adds what each meal serves today under its time (a meal the owner has not set shows none), and
 * says plainly when food will not be served to them because they opted out or did not answer. `mealAction`
 * adds something under each meal, such as the resident's late meal request or who approved it.
 */
export function MealTimings({ times, minutesIntoDay, menu, mealAction }: { times: MealTimes; minutesIntoDay: number; menu?: Partial<Record<Meal, TodayMeal>>; mealAction?: (meal: Meal) => ReactNode }) {
  const { serving, next } = mealStatus(times, minutesIntoDay)
  return (
    <div className="meal-timings" aria-label="Meal timings">
      {mealDetails.map(({ meal, label, icon: Icon }) => {
        const tag = meal === serving ? 'Now serving' : meal === next ? 'Next' : null
        const today = menu?.[meal]
        const isSkipped = today?.eating === false
        return (
          <div key={meal} className={`meal-tile${meal === serving ? ' is-serving' : meal === next ? ' is-next' : ''}${isSkipped ? ' is-skipped' : ''}`}>
            <span className="meal-icon"><Icon size={16} /></span>
            <span className="meal-copy"><strong>{label}</strong><small>{formatMealWindow(times[meal])}</small>{today?.items && <span className="meal-items">{today.items}</span>}{isSkipped && <span className="meal-not-served">Food will not be served</span>}{mealAction?.(meal)}</span>
            {tag && <em className="meal-tag">{tag}</em>}
          </div>
        )
      })}
    </div>
  )
}

/** Time inputs for the owner's Edit property form; posted as breakfastFrom, breakfastTo, etc. */
export function MealTimingFields({ times }: { times: MealTimes }) {
  return (
    <fieldset className="meal-fields">
      <legend>Meal timings <span>(shown to residents)</span></legend>
      {mealDetails.map(({ meal, label, icon: Icon }) => (
        <div key={meal} className="meal-field-row">
          <span className="meal-field-label"><Icon size={14} /> {label}</span>
          <input name={`${meal}From`} type="time" required defaultValue={times[meal].from} aria-label={`${label} starts`} />
          <span className="meal-field-to">to</span>
          <input name={`${meal}To`} type="time" required defaultValue={times[meal].to} aria-label={`${label} ends`} />
        </div>
      ))}
    </fieldset>
  )
}
