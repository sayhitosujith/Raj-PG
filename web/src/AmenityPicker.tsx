import { useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { amenityItems, amenityOptions, builtInAmenityNamed, customAmenitiesOf, isAmenityCode, maxCustomAmenities, maxCustomAmenityLength } from './propertyFeatureOptions'

/**
 * The property form's amenities: what this PG offers as chips, each with × to remove it, then "+ name"
 * buttons for the amenities not added yet (the built-in ones and those used on the owner's other PGs)
 * and a field to add a new one. Each chip posts a hidden "amenities" input, so readPropertyFeatures
 * needs no change.
 */
export function AmenityPicker({ amenities, suggestions }: { amenities: string[]; suggestions: string[] }) {
  const [chosen, setChosen] = useState(() => amenityItems(amenities).map((item) => item.value))
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')

  const has = (name: string) => chosen.some((value) => value.toLowerCase() === name.toLowerCase())
  const offered = amenityItems(chosen)
  const notAdded = amenityItems([...amenityOptions.map((option) => option.value), ...suggestions]).filter((item) => !has(item.value))

  function add(name: string) {
    if (has(name)) { setNotice(''); return }
    if (!isAmenityCode(name) && customAmenitiesOf([chosen]).length >= maxCustomAmenities) { setNotice(`A PG can have up to ${maxCustomAmenities} amenities of your own.`); return }
    setChosen((values) => [...values, name])
    setNotice('')
  }

  function addTyped() {
    const name = draft.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (/[<>]/.test(name)) { setNotice('An amenity name cannot use < or >.'); return }
    // A typed built-in ("wifi") adds that one rather than a look-alike of it.
    add(builtInAmenityNamed(name) ?? name)
    setDraft('')
  }

  function remove(value: string, label: string) {
    setChosen((values) => values.filter((existing) => existing !== value))
    setNotice(`${label} removed. Save to update this PG.`)
  }

  // Enter would otherwise submit the whole property form.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addTyped()
  }

  return (
    <>
      <div className="amenity-options">
        {offered.length ? offered.map(({ value, label, icon: Icon }) => (
          <span key={value} className="amenity-custom">
            <span className="amenity-option is-chosen"><input type="hidden" name="amenities" value={value} /><Icon size={14} /><span>{label}</span></span>
            <button type="button" className="amenity-remove" onClick={() => remove(value, label)} aria-label={`Remove ${label}`} title={`Remove ${label}`}><X size={11} /></button>
          </span>
        )) : <small className="feature-hint">No amenities yet. Add them below.</small>}
      </div>
      {notAdded.length > 0 && <div className="amenity-suggestions" aria-label="Add an amenity">
        {notAdded.map(({ value, label }) => <button key={value} type="button" className="amenity-suggestion" onClick={() => add(value)}><Plus size={12} /> {label}</button>)}
      </div>}
      <div className="amenity-add">
        <input value={draft} maxLength={maxCustomAmenityLength} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Add an amenity, e.g. Gym" aria-label="New amenity" />
        <button type="button" className="secondary-button" onClick={addTyped} disabled={!draft.trim()}><Plus size={14} /> Add</button>
      </div>
      <small className="feature-hint">{notice || `Tap + to add what this PG offers and × to remove it. Your own amenities (up to ${maxCustomAmenities} per PG) show on your website and to residents, and can be added to your other PGs too.`}</small>
    </>
  )
}
