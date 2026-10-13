import { useRef, useState, type KeyboardEvent } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import { amenityOptions, builtInAmenityNamed, customAmenitiesOf, maxCustomAmenities, maxCustomAmenityLength } from './propertyFeatureOptions'

/**
 * The property form's amenity checkboxes: the built-in ones, the owner's own (this property's, plus
 * those used on their other PGs so they can be ticked here too), and a field to add a new one. Every
 * ticked box posts as "amenities", so readPropertyFeatures needs no change.
 */
export function AmenityPicker({ amenities, suggestions }: { amenities: string[]; suggestions: string[] }) {
  const [custom, setCustom] = useState(() => mergeNames(customAmenitiesOf([amenities]), suggestions))
  // Names added on this form (lower case), which show ticked; saved ones are ticked from `amenities`.
  const [added, setAdded] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const optionsRef = useRef<HTMLDivElement>(null)

  function add() {
    const name = draft.trim().replace(/\s+/g, ' ')
    if (!name) return
    const builtIn = builtInAmenityNamed(name)
    if (builtIn) {
      // Already in the list above; tick it instead of adding a duplicate.
      const box = optionsRef.current?.querySelector<HTMLInputElement>(`input[value="${builtIn}"]`)
      if (box) box.checked = true
      setNotice(`${amenityOptions.find((option) => option.value === builtIn)?.label} is already in the list, so it is now ticked.`)
    } else if (/[<>]/.test(name)) {
      setNotice('An amenity name cannot use < or >.')
      return
    } else if (!custom.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setCustom((names) => [...names, name])
      setNotice('')
    } else setNotice('')
    setAdded((names) => [...names, name.toLowerCase()])
    setDraft('')
  }

  // Off this form, so saving drops it from this PG; other PGs that have it keep it.
  function remove(name: string) {
    const key = name.toLowerCase()
    setCustom((names) => names.filter((existing) => existing.toLowerCase() !== key))
    setAdded((names) => names.filter((existing) => existing !== key))
    setNotice(`${name} removed. Save to update this PG.`)
  }

  // Enter would otherwise submit the whole property form.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    add()
  }

  return (
    <>
      <div className="amenity-options" ref={optionsRef}>
        {amenityOptions.map(({ value, label, icon: Icon }) => (
          <label key={value} className="amenity-option">
            <input type="checkbox" name="amenities" value={value} defaultChecked={amenities.includes(value)} />
            <Icon size={14} />
            <span>{label}</span>
          </label>
        ))}
        {custom.map((name) => (
          // Keyed by the name and ticked state, so a re-added name re-renders ticked (the box is uncontrolled).
          // The remove button sits beside the label, not in it, so pressing it does not toggle the box.
          <span key={`${name}-${added.includes(name.toLowerCase())}`} className="amenity-custom">
            <label className="amenity-option">
              <input type="checkbox" name="amenities" value={name} defaultChecked={amenities.includes(name) || added.includes(name.toLowerCase())} />
              <Sparkles size={14} />
              <span>{name}</span>
            </label>
            <button type="button" className="amenity-remove" onClick={() => remove(name)} aria-label={`Remove ${name}`} title={`Remove ${name}`}><X size={11} /></button>
          </span>
        ))}
      </div>
      <div className="amenity-add">
        <input value={draft} maxLength={maxCustomAmenityLength} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Add an amenity, e.g. Gym" aria-label="New amenity" />
        <button type="button" className="secondary-button" onClick={add} disabled={!draft.trim()}><Plus size={14} /> Add</button>
      </div>
      <small className="feature-hint">{notice || `Tick what this PG offers. Amenities you add (up to ${maxCustomAmenities} per PG) show on your website and to residents, and can be ticked on your other PGs too.`}</small>
    </>
  )
}

// The property's own names first, then other PGs' names it does not already have (ignoring case).
function mergeNames(own: string[], others: string[]) {
  return [...own, ...others.filter((name) => !own.some((existing) => existing.toLowerCase() === name.toLowerCase()))]
}
