const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// How many years back the year list goes; finance history older than this is not expected.
const yearsShown = 5

/**
 * Separate Month and Year dropdowns for a "YYYY-MM" value, never later than `max` (also "YYYY-MM").
 * Two plain selects instead of `<input type="month">`, whose popup differs by browser and is easy
 * to miss. Picking a year where the chosen month is still in the future moves to `max` instead.
 */
export function MonthYearPicker({ value, max, onChange }: { value: string; max: string; onChange: (month: string) => void }) {
  const [year, month] = [Number(value.slice(0, 4)), Number(value.slice(5, 7))]
  const [maxYear, maxMonth] = [Number(max.slice(0, 4)), Number(max.slice(5, 7))]
  const years = Array.from({ length: yearsShown }, (_, index) => maxYear - index)
  const choose = (nextYear: number, nextMonth: number) => {
    const key = `${nextYear}-${String(nextMonth).padStart(2, '0')}`
    onChange(key > max ? max : key)
  }
  return (
    <div className="month-year-picker">
      <label>Month<select value={month} onChange={(event) => choose(year, Number(event.target.value))}>
        {monthNames.map((name, index) => <option key={name} value={index + 1} disabled={year === maxYear && index + 1 > maxMonth}>{name}</option>)}
      </select></label>
      <label>Year<select value={year} onChange={(event) => choose(Number(event.target.value), month)}>
        {years.map((option) => <option key={option} value={option}>{option}</option>)}
      </select></label>
    </div>
  )
}
