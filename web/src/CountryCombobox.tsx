import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Country } from './countries'
import { Flag } from './CountryFlag'

type CountryComboboxProps<T extends Country> = {
  options: T[]
  selected: T
  onSelect: (country: T) => void
  /** Accessible name of the input and list; also used when there is no visible label. */
  label: string
  /** Links a visible `<label htmlFor>` to the input. */
  inputId?: string
  /** Extra text shown after each option's name and matched by search, e.g. a calling code "+44". */
  optionDetail?: (country: T) => string
  /** What the closed input shows for the selection; the country name by default. */
  selectedText?: (country: T) => string
  className?: string
}

// Names starting with the query come first, so "in" lists India before Argentina. A query can
// also match the option detail, so "+44" or "44" finds the United Kingdom.
function findMatches<T extends Country>(options: T[], query: string, optionDetail?: (country: T) => string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return options
  const detailNeedle = needle.replace(/^\+/, '')
  const nameStarts = (country: T) => country.name.toLowerCase().startsWith(needle)
  const matching = options.filter((country) => country.name.toLowerCase().includes(needle) || (detailNeedle && optionDetail?.(country).replace(/^\+/, '').startsWith(detailNeedle)))
  return [...matching.filter(nameStarts), ...matching.filter((country) => !nameStarts(country))]
}

/**
 * Searchable country picker with SVG flags, shared by the nationality and phone country fields.
 * A native select cannot show images and emoji flags render as letter pairs on Windows, hence an
 * ARIA combobox. Controlled: the parent owns the selection and decides how it is submitted.
 */
export function CountryCombobox<T extends Country>({ options, selected, onSelect, label, inputId, optionDetail, selectedText = (country) => country.name, className }: CountryComboboxProps<T>) {
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = useMemo(() => findMatches(options, query, optionDetail), [options, query, optionDetail])
  const active = isOpen ? matches[activeIndex] : undefined

  useEffect(() => {
    if (isOpen) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeIndex])

  function open() {
    setIsOpen(true)
    setActiveIndex(Math.max(0, options.indexOf(selected)))
  }

  function close() {
    setIsOpen(false)
    setQuery('')
  }

  function choose(country: T) {
    onSelect(country)
    close()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) { open(); return }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => Math.min(Math.max(index + step, 0), matches.length - 1))
    } else if (event.key === 'Enter' && active) {
      // Picks the highlighted country instead of submitting the surrounding form.
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      close()
    }
  }

  return (
    <div className={`country-combobox${className ? ` ${className}` : ''}`}>
      <Flag code={selected.code} />
      <input id={inputId} role="combobox" aria-label={inputId ? undefined : label} aria-expanded={isOpen} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active ? `${listId}-${active.code}` : undefined} autoComplete="off" spellCheck={false}
        value={isOpen ? query : selectedText(selected)} placeholder={selectedText(selected)}
        onFocus={open} onClick={() => { if (!isOpen) open() }} onBlur={close} onKeyDown={onKeyDown}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setIsOpen(true) }} />
      <ChevronDown size={15} className="country-chevron" aria-hidden="true" />
      {isOpen && <ul id={listId} ref={listRef} role="listbox" aria-label={label} className="country-listbox">
        {matches.length
          ? matches.map((country, index) => <li key={country.code} id={`${listId}-${country.code}`} role="option" aria-selected={country.code === selected.code} className={index === activeIndex ? 'is-active' : undefined}
              // mousedown would blur the input and close the list before the click registers.
              onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(country)}><Flag code={country.code} />{country.name}{optionDetail && <span className="country-option-detail">{optionDetail(country)}</span>}</li>)
          : <li className="country-empty" role="presentation">No matching country</li>}
      </ul>}
    </div>
  )
}
