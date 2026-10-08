import { useEffect, useState } from 'react'
import { MessageSquareText, ThumbsDown, ThumbsUp, UtensilsCrossed } from 'lucide-react'
import { formatShortDate, weekdayNames, type FoodSummary, type MenuDay } from './food'
import { mealDetails, type Meal } from './meals'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'
import { Pagination } from './Pagination'
import { listPageSize, usePagination } from './usePagination'
import { InlineLoader } from './Loader'

type PropertyOption = { id: string; name: string }

async function fetchSummary(id: string) {
  const response = await fetch(`/api/properties/${id}/food-summary`)
  if (!response.ok) throw new Error('load failed')
  return { propertyId: id, data: await response.json() as FoodSummary }
}
const mealLabel = (meal: Meal) => mealDetails.find((detail) => detail.meal === meal)!.label

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

  // Failures are kept quiet: the next auto-refresh retries, and the menu editor still works.
  useEffect(() => { if (propertyId) fetchSummary(propertyId).then(setSummary, () => undefined) }, [propertyId])
  useRefreshSignal(refreshSignal, () => { if (propertyId) fetchSummary(propertyId).then(setSummary, () => undefined) })

  const data = summary?.propertyId === propertyId ? summary.data : null
  const liked = data?.feedback.filter((item) => item.liked).length ?? 0
  // Each property has its own feedback, so switching property starts at page 1.
  const feedbackPager = usePagination(data?.feedback ?? [], listPageSize, propertyId ?? '')

  return (
    <section className="workspace-view food-view">
      <div className="workspace-view-heading">
        <div><p className="eyebrow">Kitchen</p><h2>Food</h2><p>Plan the weekly menu, see how many are eating, and read residents' feedback.</p></div>
        <div className="view-actions">
          {/* One property (e.g. a receptionist with a single PG): its name as a label, so it is clear whose menu this is. */}
          {properties.length === 1 && <span className="food-property-select is-single" title="Property">{properties[0].name}</span>}
          {properties.length > 1 && <select className="food-property-select" value={propertyId} aria-label="Property" onChange={(event) => setChosenId(event.target.value)}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>}
          <button className="secondary-button" onClick={onBack}>Back to overview</button>
        </div>
      </div>

      {!propertyId ? <div className="workspace-empty"><div className="workspace-empty-icon"><UtensilsCrossed size={20} /></div><h3>No properties yet</h3><p>Add a property first, then plan its menu here.</p></div> : <div className="food-grid">
        <div className="settings-section">
          <div className="settings-section-head"><span className="settings-section-icon"><UtensilsCrossed size={18} /></span><div><h3>Headcount</h3><p>{data ? `${data.residents} active ${data.residents === 1 ? 'resident' : 'residents'}, minus anyone skipping.` : 'Loading…'}</p></div></div>
          {data && <div className="headcount-days">{data.headcounts.map((day, index) => (
            <div key={day.date}><small>{index === 0 ? 'Today' : 'Tomorrow'} · {formatShortDate(day.date)}</small>
              <ul className="headcount-meals">{day.meals.map((meal) => <li key={meal.meal}><span>{mealLabel(meal.meal)}</span><strong>{meal.eating}</strong>{meal.skipping > 0 && <small>{meal.skipping} skipping</small>}</li>)}</ul>
            </div>
          ))}</div>}
        </div>

        <div className="settings-section">
          <div className="settings-section-head"><span className="settings-section-icon"><MessageSquareText size={18} /></span><div><h3>Feedback</h3><p>{data ? (data.feedback.length ? `Last 7 days: ${liked} liked, ${data.feedback.length - liked} not liked.` : 'No feedback in the last 7 days.') : 'Loading…'}</p></div></div>
          {data && data.feedback.length > 0 && <><ul className="food-feedback">{feedbackPager.pageItems.map((item) => (
            <li key={item.id}><span className={`feedback-thumb ${item.liked ? 'is-up' : 'is-down'}`}>{item.liked ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}</span><div><strong>{mealLabel(item.meal)} · {formatShortDate(item.date)}</strong><small>{item.residentName}{item.comment ? `: “${item.comment}”` : ''}</small></div></li>
          ))}</ul><Pagination state={feedbackPager} label="Feedback" /></>}
        </div>

        <div className="settings-section wide">
          <div className="settings-section-head"><span className="settings-section-icon"><UtensilsCrossed size={18} /></span><div><h3>Weekly menu</h3><p>What is served each day. Residents see the next seven days in their portal.</p></div></div>
          <MenuEditor key={propertyId} propertyId={propertyId} onNotice={onNotice} />
        </div>
      </div>}
    </section>
  )
}
