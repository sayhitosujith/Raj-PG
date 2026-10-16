import { dietLabels, type Diet } from './diet'

/**
 * The mark Indian food packaging uses: a square outline with a dot inside, green for veg, and a
 * brown-red one with a triangle for non-veg. Recognised at a glance, so it stands in for words on
 * crowded rows.
 */
export function DietMark({ diet }: { diet: Diet }) {
  return (
    <svg className={`diet-mark is-${diet === 'VEG' ? 'veg' : 'non-veg'}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {diet === 'VEG' ? <circle cx="8" cy="8" r="3.6" fill="currentColor" /> : <path d="M8 4.2 12 11.4H4Z" fill="currentColor" />}
    </svg>
  )
}

/**
 * Veg / Non-veg as a two-button switch. Choosing the selected one again clears it back to Not set
 * (null), the state existing residents start in, so nobody is counted as either until someone picks.
 */
export function DietToggle({ value, onChange }: { value: Diet | null; onChange: (diet: Diet | null) => void }) {
  return (
    <div className="diet-toggle" role="group" aria-label="Diet">
      {(['VEG', 'NON_VEG'] as const).map((diet) => (
        <button key={diet} type="button" className={`diet-toggle-option is-${diet === 'VEG' ? 'veg' : 'non-veg'}${value === diet ? ' is-selected' : ''}`} aria-pressed={value === diet} onClick={() => onChange(value === diet ? null : diet)}>
          <DietMark diet={diet} /> {dietLabels[diet]}
        </button>
      ))}
    </div>
  )
}
