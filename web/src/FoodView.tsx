import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Check, FileDown, MessageSquareText, ThumbsDown, ThumbsUp, Users, UtensilsCrossed, X } from 'lucide-react'
import { dietLabels, type Diet } from './diet'
import { DietMark } from './DietToggle'
import { displayName } from './displayName'
import { formatShortDate, weekdayNames, type FoodSummary, type MenuDay, type TodayMealStatus } from './food'
import { mealDetails, type Meal } from './meals'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'
import { Pagination } from './Pagination'
import { listPageSize, usePagination } from './usePagination'
import { InlineLoader } from './Loader'
import { LateMealRequestsPanel } from './LateMealRequestsPanel'

type PropertyOption = { id: string; name: string }

async function fetchSummary(id: string) {
  const response = await fetch(`/api/properties/${id}/food-summary`)
  if (!response.ok) throw new Error('load failed')
  return { propertyId: id, data: await response.json() as FoodSummary }
}
const mealLabel = (meal: Meal) => mealDetails.find((detail) => detail.meal === meal)!.label

/**
 * Downloads one Kitchen panel as a PDF, built on the server from the same summary the page shows. A
 * plain download link, as the rent receipts use: the browser sends the session cookie with it, and the
 * server names the file (e.g. headcount-premium-stay-2026-10-16.pdf).
 */
function PdfExportLink({ propertyId, report }: { propertyId: string; report: 'headcount' | 'feedback' | 'residents' }) {
  return <a className="secondary-button food-export" href={`/api/properties/${propertyId}/food-summary/${report}.pdf`} download aria-label={`Export ${report} as PDF`}><FileDown size={14} /> Export PDF</a>
}

const mealStatusDetails: Record<TodayMealStatus, { word: string; icon: ReactNode }> = {
  EATING: { word: 'opted in', icon: <Check size={11} /> },
  NOT_EATING: { word: 'not opted in', icon: <X size={11} /> },
}

/** One resident's answers for a day's three meals as chips: colour, an icon, and the word in the tooltip. */
function MealChips({ statuses }: { statuses: Record<Meal, TodayMealStatus> }) {
  return (
    <span className="food-today">{mealDetails.map(({ meal, label }) => {
      const { word, icon } = mealStatusDetails[statuses[meal]]
      return <span key={meal} className={`food-today-meal is-${statuses[meal].toLowerCase().replace('_', '-')}`} title={`${label}: ${word}`}>{icon}{label}</span>
    })}</span>
  )
}

/**
 * Everyone on the food plan with their phone, room, veg / non-veg and what they opted for today and
 * tomorrow (tomorrow's can still change until 9 pm), so the kitchen can see who it is cooking for and
 * chase anyone who has not answered; the counts say how much of each to plan. Same list as the headcount PDF.
 */
function ResidentsOnFood({ propertyId, residents, status }: { propertyId: string; residents: FoodSummary['residentList'] | null; status: (text: string) => ReactNode }) {
  const count = (diet: Diet | null) => residents?.filter((resident) => resident.diet === diet).length ?? 0
  // Each property has its own residents, so switching property starts at page 1. The counts above and
  // the PDF still cover everyone, not just the page shown.
  const pager = usePagination(residents ?? [], listPageSize, propertyId)
  return (
    <div className="settings-section wide">
      <div className="settings-section-head"><span className="settings-section-icon"><Users size={18} /></span><div><h3>Residents on food</h3><p>{status(residents?.length ? `${residents.length} on the food plan: ${count('VEG')} veg · ${count('NON_VEG')} non-veg · ${count(null)} not set.` : 'Nobody is on the food plan yet.')}</p></div>{residents && residents.length > 0 && <PdfExportLink propertyId={propertyId} report="residents" />}</div>
      {residents && residents.length > 0 && <>
        <table className="finance-table food-residents">
          <thead><tr><th>Name</th><th>Phone</th><th>Room</th><th>Diet</th><th>Today</th><th>Tomorrow <span className="food-today-hint">(until 9 pm)</span></th></tr></thead>
          <tbody>{pager.pageItems.map((resident) => (
            <tr key={resident.id}>
              <td><strong>{displayName(resident.name)}</strong></td>
              <td>{resident.phone ? <a href={`tel:${resident.phone}`}>{resident.phone}</a> : '—'}</td>
              <td>{resident.room || '—'}</td>
              <td>{resident.diet ? <span className="food-residents-diet"><DietMark diet={resident.diet} /> {dietLabels[resident.diet]}</span> : <span className="food-residents-diet is-unset">Not set</span>}</td>
              <td><MealChips statuses={resident.today} /></td>
              <td><MealChips statuses={resident.tomorrow} /></td>
            </tr>
          ))}</tbody>
        </table>
        <Pagination state={pager} label="Residents on food" />
      </>}
    </div>
  )
}

/** The weekly menu form. Uncontrolled inputs keyed by property, so switching property resets it. */
function MenuEditor({ propertyId, onNotice }: { propertyId: string; onNotice: (message: string) => void }) {
  const [menu, setMenu] = useState<MenuDay[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let isCurrent = true
    fetch(`/api/properties/${propertyId}/menu`).then((response) => response.ok ? response.json() as Promise<MenuDay[]> : Promise.reject(new Error('load failed'))).then((days) => { if (isCurrent) setMenu(days) }, () => { if (isCurrent) onNotice('The menu could not be loaded.') })
    return () => { isCurrent = false }
  }, [propertyId, onNotice])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const days = weekdayNames.map((_, index) => ({ weekday: index + 1, ...Object.fromEntries(mealDetails.map(({ meal }) => [meal, String(form.get(`${index + 1}-${meal}`) ?? '')])) }))
    setIsSaving(true)
    try {
      const response = await fetch(`/api/properties/${propertyId}/menu`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) })
      onNotice(response.ok ? 'Menu saved. Residents will see it on their next refresh.' : await readApiError(response, 'The menu could not be saved.'))
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!menu) return <InlineLoader label="Loading menu…" />
  return (
    <form className="menu-editor" onSubmit={save}>
      <div className="menu-grid" role="table" aria-label="Weekly menu">
        <div className="menu-grid-row menu-grid-head" role="row"><span role="columnheader">Day</span>{mealDetails.map(({ meal, label }) => <span key={meal} role="columnheader">{label}</span>)}</div>
        {menu.map((day) => (
          <div key={day.weekday} className="menu-grid-row" role="row">
            <strong role="rowheader">{weekdayNames[day.weekday - 1]}</strong>
            {mealDetails.map(({ meal, label }) => <input key={meal} role="cell" name={`${day.weekday}-${meal}`} defaultValue={day[meal] ?? ''} maxLength={200} placeholder={label} aria-label={`${weekdayNames[day.weekday - 1]} ${label.toLowerCase()}`} />)}
          </div>
        ))}
      </div>
      <div className="settings-actions"><small className="settings-hint">Repeats every week. Leave a meal blank if there is no menu for it.</small><button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save menu'}</button></div>
    </form>
  )
}

/**
 * Owner's food screen for one property at a time: the weekly menu, who is eating today and
 * tomorrow (residents minus skips), and the last week's meal feedback.
 */
export function FoodView({ properties: allProperties, refreshSignal, onBack, onNotice }: { properties: Array<{ id?: string; name: string }>; refreshSignal: number; onBack: () => void; onNotice: (message: string) => void }) {
  // Sample properties shown when the API is offline have no id, so they cannot hold a menu.
  const properties = allProperties.filter((property): property is PropertyOption => Boolean(property.id))
  const [chosenId, setChosenId] = useState<string | null>(null)
  const propertyId = properties.some((property) => property.id === chosenId) ? chosenId! : properties[0]?.id
  const [summary, setSummary] = useState<{ propertyId: string; data: FoodSummary } | null>(null)
  // The property whose summary last failed to load. The panels used to say "Loading…" for ever after a
  // failure (a sleeping database, a dropped connection), which read as the page hanging; now they say
  // so and offer Retry. The auto-refresh still retries on its own, and the menu editor is unaffected.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const loadSummary = useCallback((id: string) => fetchSummary(id).then((next) => { setSummary(next); setFailedFor(null) }, () => setFailedFor(id)), [])

  useEffect(() => { if (propertyId) void loadSummary(propertyId) }, [propertyId, loadSummary])
  useRefreshSignal(refreshSignal, () => { if (propertyId) void loadSummary(propertyId) })

  const data = summary?.propertyId === propertyId ? summary.data : null
  const hasFailed = !data && failedFor === propertyId
  const status = (text: string) => hasFailed ? <>Could not load this. <button type="button" className="text-link" onClick={() => { setFailedFor(null); if (propertyId) void loadSummary(propertyId) }}>Retry</button></> : data ? text : 'Loading…'
  const liked = data?.feedback.filter((item) => item.liked).length ?? 0
  // Each property has its own feedback, so switching property starts at page 1.
  const feedbackPager = usePagination(data?.feedback ?? [], listPageSize, propertyId ?? '')

  return (
    <section className="workspace-view food-view">
      <div className="workspace-view-heading">
        <div><p className="eyebrow">Food</p><h2>Kitchen</h2><p>Plan the weekly menu, see how many are eating, and read residents' feedback.</p></div>
        <div className="view-actions">
          {/* One property (e.g. a receptionist with a single PG): its name as a label, so it is clear whose menu this is. */}
          {properties.length === 1 && <span className="food-property-select is-single" title="Property">{properties[0].name}</span>}
          {properties.length > 1 && <select className="food-property-select" value={propertyId} aria-label="Property" onChange={(event) => setChosenId(event.target.value)}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>}
          <button className="secondary-button" onClick={onBack}>Back to overview</button>
        </div>
      </div>

      {!propertyId ? <div className="workspace-empty"><div className="workspace-empty-icon"><UtensilsCrossed size={20} /></div><h3>No properties yet</h3><p>Add a property first, then plan its menu here.</p></div> : <div className="food-grid">
        <LateMealRequestsPanel key={propertyId} propertyId={propertyId} refreshSignal={refreshSignal} onDecided={() => void loadSummary(propertyId)} onNotice={onNotice} />

        <div className="settings-section">
          <div className="settings-section-head"><span className="settings-section-icon"><UtensilsCrossed size={18} /></span><div><h3>Headcount</h3><p>{status(data ? `${data.residents} active ${data.residents === 1 ? 'resident' : 'residents'} on food. Residents opt in by 9 pm the day before; anyone who has not opted in is not eating.` : '')}</p></div>{data && <PdfExportLink propertyId={propertyId} report="headcount" />}</div>
          {data && <div className="headcount-days">{data.headcounts.map((day, index) => (
            <div key={day.date}><small>{index === 0 ? 'Today' : 'Tomorrow'} · {formatShortDate(day.date)}</small>
              <ul className="headcount-meals">{day.meals.map((meal) => <li key={meal.meal}><span>{mealLabel(meal.meal)}</span><strong>{meal.eating}</strong>{meal.eating > 0 && (meal.veg > 0 || meal.nonVeg > 0) && <small className="headcount-diet"><span className="is-veg">{meal.veg} veg</span> · <span className="is-non-veg">{meal.nonVeg} non-veg</span></small>}{meal.notEating > 0 && <small>{meal.notEating} not eating</small>}</li>)}</ul>
            </div>
          ))}</div>}
        </div>

        <div className="settings-section">
          <div className="settings-section-head"><span className="settings-section-icon"><MessageSquareText size={18} /></span><div><h3>Feedback</h3><p>{status(data?.feedback.length ? `Last 7 days: ${liked} liked, ${data.feedback.length - liked} not liked.` : 'No feedback in the last 7 days.')}</p></div>{data && <PdfExportLink propertyId={propertyId} report="feedback" />}</div>
          {data && data.feedback.length > 0 && <><ul className="food-feedback">{feedbackPager.pageItems.map((item) => (
            <li key={item.id}><span className={`feedback-thumb ${item.liked ? 'is-up' : 'is-down'}`}>{item.liked ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}</span><div><strong>{mealLabel(item.meal)} · {formatShortDate(item.date)}</strong><small>{item.residentName}{item.comment ? `: “${item.comment}”` : ''}</small></div></li>
          ))}</ul><Pagination state={feedbackPager} label="Feedback" /></>}
        </div>

        <div className="settings-section wide">
          <div className="settings-section-head"><span className="settings-section-icon"><UtensilsCrossed size={18} /></span><div><h3>Weekly menu</h3><p>What is served each day. Residents see the next seven days in their portal.</p></div></div>
          <MenuEditor key={propertyId} propertyId={propertyId} onNotice={onNotice} />
        </div>

        <ResidentsOnFood propertyId={propertyId} residents={data?.residentList ?? null} status={status} />
      </div>}
    </section>
  )
}
