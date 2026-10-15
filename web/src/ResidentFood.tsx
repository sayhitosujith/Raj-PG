import { useEffect, useRef, useState } from 'react'
import { ThumbsDown, ThumbsUp, UtensilsCrossed, X } from 'lucide-react'
import { relativeDayLabel, type ResidentFood, type ResidentMeal, type ResidentMenuDay } from './food'
import { formatMealWindow, mealDetails, type Meal } from './meals'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'
import { InlineLoader } from './Loader'
import { propertyMinutesIntoDay } from './propertyTime'
import { ModalLayer } from './ModalLayer'

async function fetchFood() {
  const response = await fetch('/api/resident-portal/food')
  if (!response.ok) throw new Error('load failed')
  return (await response.json()) as ResidentFood
}
const fetchMenu = async () => (await fetchFood()).days

async function send(url: string, body: unknown) {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return response.ok ? null : await readApiError(response, 'That could not be saved.')
}

/** Saves eat (true) or skip (false) for meals of one day; returns an error message, or null when saved. */
const saveChoices = (date: string, choices: Partial<Record<Meal, boolean>>) => send('/api/resident-portal/food/choices', { date, choices })

/** Eat / Skip as a pair of buttons for one meal; neither is pressed while it is not answered. */
function MealChoiceToggle({ label, answer, disabled, onChoose }: { label: string; answer: boolean | null; disabled?: boolean; onChoose: (eating: boolean) => void }) {
  return (
    <div className="meal-choice" role="group" aria-label={`${label}: eat or skip`}>
      <button type="button" className={answer === true ? 'is-eat' : undefined} aria-pressed={answer === true} disabled={disabled} onClick={() => onChoose(true)}>Eat</button>
      <button type="button" className={answer === false ? 'is-skip' : undefined} aria-pressed={answer === false} disabled={disabled} onClick={() => onChoose(false)}>Skip</button>
    </div>
  )
}

/** The status a meal shows once it can no longer be changed, or while it still needs an answer. */
function choiceStatus(meal: ResidentMeal) {
  if (meal.answer === null && meal.canChange) return <span className="status-pill gold">Answer by 9 pm the day before</span>
  if (meal.canChange) return null
  if (meal.answer === null && !meal.eating) return <span className="status-pill coral">No answer · not eating</span>
  return meal.eating ? <span className="status-pill sage">Eating</span> : <span className="status-pill gold">Skipping</span>
}

const thanksFor = (liked: boolean) => liked ? 'Thanks for the feedback.' : 'Thanks for the feedback. Food quality will be improved.'

/**
 * Thumbs up/down plus an optional comment for one of today's served meals. The choice shows the moment
 * it is tapped and saves in the background (the menu reload is not waited for), going back to what was
 * saved before if the server refuses it.
 *
 * Saves are sent one after another, never side by side, so a thumb tapped just before Save cannot land
 * after it and wipe the comment. That ordering is what lets nothing be disabled while a save is in
 * flight: Save used to stay greyed out until the thumb's save came back, a second or more on a slow link.
 *
 * `onSubmitted`, when given, makes Save close at once: the rating prompt uses it, thanking the resident
 * straight away and saving in the background, with an error notice if the save then fails.
 */
function MealFeedback({ meal, onSaved, onNotice, onSubmitted }: { meal: ResidentMeal; onSaved: () => Promise<void>; onNotice: (message: string) => void; onSubmitted?: () => void }) {
  const [comment, setComment] = useState(meal.feedback?.comment ?? '')
  const [liked, setLiked] = useState(meal.feedback?.liked)
  const [savedComment, setSavedComment] = useState(meal.feedback?.comment ?? '')
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  /**
   * Sends after any save already in flight; resolves to the error message, or null once saved. A
   * dropped connection becomes a message too: the prompt has already closed, so a rejected promise
   * would fail with nothing on screen.
   */
  function persist(choice: boolean, text: string) {
    const result = queue.current.then(() => send('/api/resident-portal/food/feedback', { meal: meal.meal, liked: choice, comment: text })).catch(() => 'Could not reach the server.')
    queue.current = result
    return result
  }

  async function save(choice: boolean) {
    const previous = liked
    const text = comment
    setLiked(choice)
    const error = await persist(choice, text)
    if (error) { setLiked(previous); onNotice(error); return }
    setSavedComment(text)
    onNotice(thanksFor(choice))
    void onSaved()
  }

  function submit(choice: boolean) {
    if (!onSubmitted) { void save(choice); return }
    onSubmitted()
    if (comment === savedComment) return
    onNotice(thanksFor(choice))
    void persist(choice, comment).then((error) => error ? onNotice(`Your comment was not saved: ${error}`) : onSaved())
  }

  return (
    <div className="meal-feedback">
      <span>How was it?</span>
      <button type="button" className={`icon-button${liked === true ? ' is-active' : ''}`} aria-label="Thumbs up" aria-pressed={liked === true} onClick={() => void save(true)}><ThumbsUp size={14} /></button>
      <button type="button" className={`icon-button${liked === false ? ' is-active is-negative' : ''}`} aria-label="Thumbs down" aria-pressed={liked === false} onClick={() => void save(false)}><ThumbsDown size={14} /></button>
      {liked !== undefined && <form className="meal-comment" onSubmit={(event) => { event.preventDefault(); submit(liked) }}><input value={comment} maxLength={300} placeholder="Add a comment (optional)" aria-label="Comment" onChange={(event) => setComment(event.target.value)} /><button type="submit" className="secondary-button" disabled={comment === savedComment && !onSubmitted}>Save</button></form>}
    </div>
  )
}

/**
 * The resident's food menu for the next seven days: eat or skip each meal by 9 pm the day before
 * (no answer means not eating), and rate today's meals once they have been served. Mounted only while
 * the modal is open, so each opening fetches the latest menu.
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

  async function choose(date: string, meal: ResidentMeal, eating: boolean) {
    if (meal.answer === eating) return
    setSavingKey(`${date}-${meal.meal}`)
    const error = await saveChoices(date, { [meal.meal]: eating })
    await load()
    setSavingKey(null)
    onNotice(error ?? (eating ? 'Saved: you are eating that meal.' : 'Saved: you are skipping that meal.'))
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
              <li key={key} className={meal.eating ? undefined : 'is-skipped'}>
                <span className="menu-meal-icon"><Icon size={16} /></span>
                <div className="menu-meal-body">
                  <div className="menu-meal-head"><strong>{label}</strong><small>{formatMealWindow(meal)}</small>{choiceStatus(meal)}</div>
                  <p className={meal.items ? undefined : 'is-empty'}>{meal.items ?? 'Menu not set yet'}</p>
                  {meal.canRate && <MealFeedback key={key} meal={meal} onSaved={load} onNotice={onNotice} />}
                </div>
                {meal.canChange && <MealChoiceToggle label={label} answer={meal.answer} disabled={savingKey === key} onChoose={(eating) => choose(day.date, meal, eating)} />}
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
      {isOpen && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)}>
        <div className="profile-modal menu-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-menu-title">
          <div className="modal-heading"><div><p className="eyebrow">Food</p><h2 id="weekly-menu-title">Weekly menu</h2></div><button type="button" className="icon-button" aria-label="Close weekly menu" onClick={() => setIsOpen(false)}><X size={18} /></button></div>
          <p className="menu-modal-hint">Choose eat or skip for every meal by 9 pm the day before; a meal with no answer counts as not eating. Tell us how today's meals were.</p>
          <MenuBody refreshSignal={refreshSignal} onNotice={onNotice} />
        </div>
      </div></ModalLayer>}
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

/**
 * Asks for tomorrow's breakfast, lunch and dinner while any is unanswered before the 9 pm cutoff, as a
 * window that cannot be closed until every meal has an answer: the kitchen cooks only for residents
 * who said they are eating, so an answer is required. "Eating all three" answers in one tap.
 */
export function MealChoiceGate({ refreshSignal, onNotice }: { refreshSignal: number; onNotice: (message: string) => void }) {
  const [food, setFood] = useState<ResidentFood | null>(null)
  const [picked, setPicked] = useState<Partial<Record<Meal, boolean>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchFood().then(setFood, () => undefined) }, [])
  useRefreshSignal(refreshSignal, () => { fetchFood().then(setFood, () => undefined) })

  const day = food?.answerDue ? food.days.find((item) => item.date === food.answerDue) : undefined
  if (!food || !day) return null
  const open = day.meals.filter((meal) => meal.canChange)
  // What the resident sees ticked: this window's picks, else what they already saved.
  const answerOf = (meal: ResidentMeal) => picked[meal.meal] ?? meal.answer
  const isComplete = open.every((meal) => answerOf(meal) !== null)
  const dayLabel = relativeDayLabel(day.date, food.days[0].date).toLowerCase()

  async function save(choices: Partial<Record<Meal, boolean>>) {
    setIsSaving(true)
    const failure = await saveChoices(day!.date, choices)
    setIsSaving(false)
    if (failure) { setError(failure); return }
    setError('')
    setPicked({})
    onNotice(`Saved your meals for ${dayLabel}.`)
    setFood(await fetchFood().catch(() => ({ ...food!, answerDue: null })))
  }
  const answers = () => Object.fromEntries(open.map((meal) => [meal.meal, answerOf(meal)])) as Partial<Record<Meal, boolean>>

  return (
    <ModalLayer><div className="modal-backdrop" role="presentation">
      <div className="profile-modal meal-choice-modal" role="dialog" aria-modal="true" aria-labelledby="meal-choice-title">
        <div className="modal-heading"><div><p className="eyebrow">Food · required</p><h2 id="meal-choice-title">Your meals {dayLabel}</h2></div></div>
        <p className="menu-modal-hint">Tell the kitchen by 9 pm today. A meal you do not answer counts as not eating.</p>
        <ul className="menu-meals">
          {open.map((meal) => {
            const { label, icon: Icon } = mealDetails.find((detail) => detail.meal === meal.meal)!
            return (
              <li key={meal.meal} className={answerOf(meal) === false ? 'is-skipped' : undefined}>
                <span className="menu-meal-icon"><Icon size={16} /></span>
                <div className="menu-meal-body">
                  <div className="menu-meal-head"><strong>{label}</strong><small>{formatMealWindow(meal)}</small></div>
                  <p className={meal.items ? undefined : 'is-empty'}>{meal.items ?? 'Menu not set yet'}</p>
                </div>
                <MealChoiceToggle label={label} answer={answerOf(meal)} disabled={isSaving} onChoose={(eating) => setPicked((current) => ({ ...current, [meal.meal]: eating }))} />
              </li>
            )
          })}
        </ul>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={isSaving} onClick={() => save(Object.fromEntries(open.map((meal) => [meal.meal, true])))}>Eating all {open.length === 3 ? 'three' : open.length}</button>
          <button type="button" className="primary-button" disabled={isSaving || !isComplete} onClick={() => save(answers())}>{isSaving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div></ModalLayer>
  )
}

// Meals the resident closed the rating prompt for, so it does not come back for them. Per device; if
// storage is blocked the prompt may simply show once more.
const ratedPromptKey = 'raj-pg-meal-rating-prompted'
function readPrompted(): string[] { try { return JSON.parse(window.localStorage.getItem(ratedPromptKey) ?? '[]') as string[] } catch { return [] } }
function savePrompted(key: string) { try { window.localStorage.setItem(ratedPromptKey, JSON.stringify([...readPrompted(), key].slice(-30))) } catch { /* shows again */ } }
const toMinutes = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }

/**
 * Asks "How was lunch?" by itself once each of today's meals is over (its end time has passed), for a
 * meal the resident ate and has not rated yet. It checks every minute, so it appears at the end time
 * without a reload, and shows once per meal: closing it (rated or not) is remembered on this device.
 */
export function MealRatingPrompt({ refreshSignal, onNotice }: { refreshSignal: number; onNotice: (message: string) => void }) {
  const [days, setDays] = useState<ResidentMenuDay[] | null>(null)
  const [minutes, setMinutes] = useState(() => propertyMinutesIntoDay(new Date()))
  const [prompted, setPrompted] = useState(readPrompted)
  const [open, setOpen] = useState<string | null>(null)
  const load = () => fetchMenu().then(setDays, () => undefined)

  useEffect(() => { void load() }, [])
  useRefreshSignal(refreshSignal, () => { void load() })
  useEffect(() => {
    const timer = window.setInterval(() => setMinutes(propertyMinutesIntoDay(new Date())), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const today = days?.[0]
  // The latest of today's finished meals still waiting for a rating.
  const due = today?.meals.filter((meal) => meal.canRate && !meal.feedback && toMinutes(meal.to) <= minutes && !prompted.includes(`${today.date}-${meal.meal}`)).at(-1)
  const key = open ?? (today && due ? `${today.date}-${due.meal}` : null)
  // Once open it stays on that meal while the resident rates and comments, until they close it.
  useEffect(() => { if (!open && key) setOpen(key) }, [open, key])
  const meal = open && today ? today.meals.find((item) => `${today.date}-${item.meal}` === open) : null
  if (!open || !meal) return null

  const { label } = mealDetails.find((detail) => detail.meal === meal.meal)!
  function close() {
    savePrompted(open!)
    setPrompted(readPrompted())
    setOpen(null)
  }
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="profile-modal meal-rating-modal" role="dialog" aria-modal="true" aria-labelledby="meal-rating-title">
        <div className="modal-heading"><div><p className="eyebrow">Food</p><h2 id="meal-rating-title">How was {label.toLowerCase()}?</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={close}><X size={18} /></button></div>
        <p className="menu-modal-hint">{meal.items ?? label} · {formatMealWindow(meal)}. Your rating goes to the kitchen.</p>
        <MealFeedback key={open} meal={meal} onSaved={async () => { await load() }} onNotice={onNotice} onSubmitted={close} />
      </div>
    </div></ModalLayer>
  )
}
