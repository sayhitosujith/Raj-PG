import { formatMealWindow, mealDetails, mealStatus, type MealTimes } from './meals'

/** The resident's meal timings, highlighting the meal being served now or the next one. */
export function MealTimings({ times, minutesIntoDay }: { times: MealTimes; minutesIntoDay: number }) {
  const { serving, next } = mealStatus(times, minutesIntoDay)
  return (
    <div className="meal-timings" aria-label="Meal timings">
      {mealDetails.map(({ meal, label, icon: Icon }) => {
        const tag = meal === serving ? 'Now serving' : meal === next ? 'Next' : null
        return (
          <div key={meal} className={`meal-tile${meal === serving ? ' is-serving' : meal === next ? ' is-next' : ''}`}>
            <span className="meal-icon"><Icon size={16} /></span>
            <span className="meal-copy"><strong>{label}</strong><small>{formatMealWindow(times[meal])}</small></span>
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
