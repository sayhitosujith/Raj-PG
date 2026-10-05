import { useEffect, useState } from 'react'
import { BellRing, ThumbsDown, ThumbsUp, UtensilsCrossed, X } from 'lucide-react'
import { relativeDayLabel, type ResidentMeal, type ResidentMenuDay } from './food'
import { formatMealWindow, mealDetails, type Meal } from './meals'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'
import { InlineLoader } from './Loader'

async function fetchMenu() {
  const response = await fetch('/api/resident-portal/food')
  if (!response.ok) throw new Error('load failed')
  return ((await response.json()) as { days: ResidentMenuDay[] }).days
}

async function send(url: string, body: unknown) {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return response.ok ? null : await readApiError(response, 'That could not be saved.')
}

/** Flips a meal between skipped and eating; returns the notice to show (an error or a confirmation). */
async function toggleSkip(date: string, meal: ResidentMeal) {
  const error = await send('/api/resident-portal/food/skips', { date, meal: meal.meal, skipped: !meal.skipped })
  return error ?? (meal.skipped ? 'You are back in for that meal.' : 'Meal skipped. The kitchen will cook for one less.')
}

/** Thumbs up/down plus an optional comment for one of today's served meals. */
function MealFeedback({ meal, onSaved, onNotice }: { meal: ResidentMeal; onSaved: () => Promise<void>; onNotice: (message: string) => void }) {
  const [comment, setComment] = useState(meal.feedback?.comment ?? '')
  const [isSaving, setIsSaving] = useState(false)

  async function save(liked: boolean) {
    setIsSaving(true)
    const error = await send('/api/resident-portal/food/feedback', { meal: meal.meal, liked, comment })
    setIsSaving(false)
    if (error) { onNotice(error); return }
    await onSaved()
    onNotice('Thanks for the feedback.')
  }

  const liked = meal.feedback?.liked
  return (
    <div className="meal-feedback">
      <span>How was it?</span>
      <button type="button" className={`icon-button${liked === true ? ' is-active' : ''}`} aria-label="Thumbs up" aria-pressed={liked === true} disabled={isSaving} onClick={() => save(true)}><ThumbsUp size={14} /></button>
      <button type="button" className={`icon-button${liked === false ? ' is-active is-negative' : ''}`} aria-label="Thumbs down" aria-pressed={liked === false} disabled={isSaving} onClick={() => save(false)}><ThumbsDown size={14} /></button>
      {meal.feedback && <form className="meal-comment" onSubmit={(event) => { event.preventDefault(); void save(meal.feedback!.liked) }}><input value={comment} maxLength={300} placeholder="Add a comment (optional)" aria-label="Comment" onChange={(event) => setComment(event.target.value)} /><button type="submit" className="secondary-button" disabled={isSaving || comment === (meal.feedback.comment ?? '')}>Save</button></form>}
    </div>
  )
}

/**
 * The resident's food menu for the next seven days: skip a meal before it starts so the kitchen
 * cooks for fewer, and rate today's meals once they have been served. Mounted only while the modal
 * is open, so each opening fetches the latest menu.
 */
function MenuBody({ refreshSignal, onNotice }: { refreshSignal: number; onNotice: (message: string) => void }) {
  const [days, setDays] = useState<ResidentMenuDay[] | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  function showDays(list: ResidentMenuDay[]) {
    setDays(list)
    setLoadError(false)
  }
  const load = () => fetchMenu().then(showDays, () => setLoadError(true))

  useEffect(() => { fetchMenu().then(showDays, () => setLoadError(true)) }, [])
  useRefreshSignal(refreshSignal, () => { void load() })

  async function changeSkip(date: string, meal: ResidentMeal) {
    setSavingKey(`${date}-${meal.meal}`)
    const notice = await toggleSkip(date, meal)
    await load()
    setSavingKey(null)
    onNotice(notice)
  }

  const today = days?.[0]?.date
  const day = days?.find((item) => item.date === selectedDate) ?? days?.[0]

  return (
    <>
      {!days ? (loadError ? <p className="portal-empty">The menu could not be loaded. It will retry on the next refresh.</p> : <InlineLoader label="Loading menu…" />) : <>
        <div className="menu-days" role="tablist" aria-label="Choose a day">
          {days.map((item) => <button key={item.date} type="button" role="tab" aria-selected={item.date === day?.date} className={`menu-day${item.date === day?.date ? ' is-selected' : ''}`} onClick={() => setSelectedDate(item.date)}>{relativeDayLabel(item.date, today!)}</button>)}
        </div>
        {day && <ul className="menu-meals">
          {day.meals.map((meal) => {
            const { label, icon: Icon } = mealDetails.find((detail) => detail.meal === meal.meal)!
            const key = `${day.date}-${meal.meal}`
            return (
              <li key={key} className={meal.skipped ? 'is-skipped' : undefined}>
                <span className="menu-meal-icon"><Icon size={16} /></span>
                <div className="menu-meal-body">
                  <div className="menu-meal-head"><strong>{label}</strong><small>{formatMealWindow(meal)}</small>{meal.skipped && <span className="status-pill gold">Skipping</span>}</div>
                  <p className={meal.items ? undefined : 'is-empty'}>{meal.items ?? 'Menu not set yet'}</p>
                  {meal.canRate && <MealFeedback key={`${key}-${meal.feedback?.liked}`} meal={meal} onSaved={load} onNotice={onNotice} />}
                </div>
                {meal.canSkip && <button type="button" className="secondary-button" disabled={savingKey === key} onClick={() => changeSkip(day.date, meal)}>{meal.skipped ? 'Undo skip' : 'Skip'}</button>}
              </li>
            )
          })}
        </ul>}
      </>}
    </>
  )
}

/** "Weekly menu" button for the resident's details header; opens the menu in a modal. */
export function WeeklyMenuButton({ refreshSignal, onNotice }: { refreshSignal: number; onNotice: (message: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button type="button" className="secondary-button weekly-menu-button" onClick={() => setIsOpen(true)}><UtensilsCrossed size={15} /> Weekly menu</button>
      {isOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)}>
        <div className="profile-modal menu-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-menu-title">
          <div className="modal-heading"><div><p className="eyebrow">Food</p><h2 id="weekly-menu-title">Weekly menu</h2></div><button type="button" className="icon-button" aria-label="Close weekly menu" onClick={() => setIsOpen(false)}><X size={18} /></button></div>
          <p className="menu-modal-hint">Skip a meal before it starts if you will be away, and tell us how today's meals were.</p>
          <MenuBody refreshSignal={refreshSignal} onNotice={onNotice} />
        </div>
      </div>}
    </>
  )
}

/**
 * What each meal serves today, from the resident's menu; null while loading, on failure, or when
 * `enabled` is false. Residents without the food plan pass false, since the menu API refuses them.
 */
export function useTodayMenu(refreshSignal: number, enabled: boolean) {
  const [days, setDays] = useState<ResidentMenuDay[] | null>(null)
  useEffect(() => { if (enabled) fetchMenu().then(setDays, () => undefined) }, [enabled])
  useRefreshSignal(refreshSignal, () => { if (enabled) fetchMenu().then(setDays, () => undefined) })
  const today = enabled ? days?.[0] : undefined
  return today ? Object.fromEntries(today.meals.map((meal) => [meal.meal, meal.items])) as Partial<Record<Meal, string | null>> : null
}

// Which meal alert the resident answered "I'll eat" to. Per-browser convenience only: eating is the
// default, so nothing needs saving on the server, and a lost value just shows the alert again.
const answeredKey = 'raj-pg-meal-alert-answered'
function readAnswered() { try { return window.localStorage.getItem(answeredKey) } catch { return null } }
function saveAnswered(value: string) { try { window.localStorage.setItem(answeredKey, value) } catch { /* storage blocked */ } }

/**
 * Alert for the next meal the resident can still change: eat (the default) or skip it. It moves on
 * to the following meal once this one starts, and hides after "I'll eat" until then.
 */
export function NextMealAlert({ refreshSignal, onNotice }: { refreshSignal: number; onNotice: (message: string) => void }) {
  const [days, setDays] = useState<ResidentMenuDay[] | null>(null)
  const [answered, setAnswered] = useState(readAnswered)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { fetchMenu().then(setDays, () => undefined) }, [])
  useRefreshSignal(refreshSignal, () => { fetchMenu().then(setDays, () => undefined) })

  const next = days?.flatMap((day) => day.meals.map((meal) => ({ date: day.date, meal }))).find((item) => item.meal.canSkip)
  if (!days || !next) return null
  const key = `${next.date}-${next.meal.meal}`
  if (answered === key && !next.meal.skipped) return null

  const { label } = mealDetails.find((detail) => detail.meal === next.meal.meal)!
  const when = `${label} ${relativeDayLabel(next.date, days[0].date).toLowerCase()}, ${formatMealWindow(next.meal)}`

  async function skip() {
    setIsSaving(true)
    onNotice(await toggleSkip(next!.date, next!.meal))
    setDays(await fetchMenu().catch(() => days))
    setIsSaving(false)
  }
  function eat() {
    saveAnswered(key)
    setAnswered(key)
  }

  return (
    <div className="rent-banner meal-alert" role="status">
      <BellRing size={18} />
      <div className="meal-alert-body">
        <strong>{next.meal.skipped ? `You are skipping ${when}` : `${when}. Will you be eating?`}</strong>
        <p>{next.meal.items ?? 'Menu not set yet'}</p>
      </div>
      <div className="meal-alert-actions">
        {next.meal.skipped
          ? <button type="button" className="secondary-button" disabled={isSaving} onClick={skip}>Undo skip</button>
          : <><button type="button" className="primary-button" disabled={isSaving} onClick={eat}>Yes, I'll eat</button><button type="button" className="secondary-button" disabled={isSaving} onClick={skip}>Skip it</button></>}
      </div>
    </div>
  )
}
