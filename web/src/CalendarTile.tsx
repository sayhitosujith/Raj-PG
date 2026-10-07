import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { holidayOn, type Holiday } from './holidays'

const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const pad = (value: number) => String(value).padStart(2, '0')
const isoDay = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

/**
 * The "Today" tile in the resident's today grid, which opens a month calendar when tapped: today
 * circled, public holidays marked (name on hover), and arrows to look at other months. Closes on a
 * tap outside, Escape, or the tile again.
 */
export function CalendarTile({ label, holidays }: { label: string; holidays: Holiday[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const today = new Date()
  const [shown, setShown] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = (event: MouseEvent) => { if (!wrapperRef.current?.contains(event.target as Node)) setIsOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [isOpen])

  function toggle() {
    // Each opening starts on this month.
    if (!isOpen) setShown({ year: today.getFullYear(), month: today.getMonth() })
    setIsOpen((open) => !open)
  }
  const move = (step: number) => setShown(({ year, month }) => {
    const next = new Date(year, month + step, 1)
    return { year: next.getFullYear(), month: next.getMonth() }
  })

  // Monday-first grid: blanks before the 1st, then each day of the month.
  const firstWeekday = (new Date(shown.year, shown.month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(shown.year, shown.month + 1, 0).getDate()
  const cells = [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  const todayIso = isoDay(today.getFullYear(), today.getMonth(), today.getDate())
  const monthTitle = new Date(shown.year, shown.month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className="calendar-tile" ref={wrapperRef}>
      <button type="button" className="today-tile is-date calendar-tile-button" aria-expanded={isOpen} aria-label={`${label}. Open calendar`} onClick={toggle}>
        <span className="today-tile-icon" aria-hidden="true"><CalendarDays size={16} /></span>
        <span className="today-tile-copy"><small>Today</small><strong>{label}</strong></span>
      </button>
      {isOpen && <div className="calendar-popover" role="dialog" aria-label="Calendar">
        <div className="calendar-head">
          <button type="button" className="icon-button" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
          <strong>{monthTitle}</strong>
          <button type="button" className="icon-button" aria-label="Next month" onClick={() => move(1)}><ChevronRight size={16} /></button>
        </div>
        <div className="calendar-grid">
          {weekdays.map((day) => <span key={day} className="calendar-weekday">{day}</span>)}
          {cells.map((day, index) => {
            if (day === null) return <span key={`blank-${index}`} />
            const iso = isoDay(shown.year, shown.month, day)
            const holiday = holidayOn(holidays, iso)
            return <span key={iso} className={`calendar-day${iso === todayIso ? ' is-today' : ''}${holiday ? ' is-holiday' : ''}`} title={holiday ?? undefined}>{day}</span>
          })}
        </div>
        {holidays.length > 0 && <p className="calendar-legend"><span className="calendar-legend-dot" /> Public holiday</p>}
      </div>}
    </div>
  )
}
