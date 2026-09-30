import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { countries, type Country } from './countries'

// Flags are referenced by URL instead of through flag-icons' stylesheet, which would put every flag
// into the app-wide CSS that residents download too.
const flagDirectory = '/node_modules/flag-icons/flags/4x3/'
const flagUrls = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default', eager: true })

function Flag({ code }: { code: string }) {
  return <img className="country-flag" src={flagUrls[`${flagDirectory}${code.toLowerCase()}.svg`]} alt="" width={20} height={15} loading="lazy" />
}

/** A country's flag and English name, for read-only display; falls back to the bare code if unknown. */
export function CountryLabel({ code }: { code: string }) {
  const country = countries.find((candidate) => candidate.code === code)
  return <span className="country-label">{country && <Flag code={country.code} />}{country?.name ?? code}</span>
}

// Names starting with the query come first, so "in" lists India before Argentina.
function findMatches(query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return countries
  const matching = countries.filter((country) => country.name.toLowerCase().includes(needle))
  return [...matching.filter((country) => country.name.toLowerCase().startsWith(needle)), ...matching.filter((country) => !country.name.toLowerCase().startsWith(needle))]
}

/**
 * Searchable country picker with SVG flags. A native select cannot show images and emoji flags
 * render as letter pairs on Windows, hence an ARIA combobox. The chosen code is submitted through a
 * hidden input, so the field works with FormData like any other; a country is always selected.
 */
export function CountrySelect({ name, label, defaultCode }: { name: string; label: string; defaultCode: string }) {
  const inputId = useId()
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const [selected, setSelected] = useState<Country>(() => countries.find((country) => country.code === defaultCode) ?? countries[0])
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = useMemo(() => findMatches(query), [query])
  const active = isOpen ? matches[activeIndex] : undefined

  useEffect(() => {
    if (isOpen) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeIndex])

  function open() {
    setIsOpen(true)
    setActiveIndex(Math.max(0, countries.indexOf(selected)))
  }

  function close() {
    setIsOpen(false)
    setQuery('')
  }

  function choose(country: Country) {
    setSelected(country)
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
    <div className="country-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="country-combobox">
        <Flag code={selected.code} />
        <input id={inputId} role="combobox" aria-expanded={isOpen} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active ? `${listId}-${active.code}` : undefined} autoComplete="off" spellCheck={false}
          value={isOpen ? query : selected.name} placeholder={selected.name}
          onFocus={open} onClick={() => { if (!isOpen) open() }} onBlur={close} onKeyDown={onKeyDown}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setIsOpen(true) }} />
        <ChevronDown size={15} className="country-chevron" aria-hidden="true" />
        <input type="hidden" name={name} value={selected.code} />
        {isOpen && <ul id={listId} ref={listRef} role="listbox" aria-label={label} className="country-listbox">
          {matches.length
            ? matches.map((country, index) => <li key={country.code} id={`${listId}-${country.code}`} role="option" aria-selected={country.code === selected.code} className={index === activeIndex ? 'is-active' : undefined}
                // mousedown would blur the input and close the list before the click registers.
                onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(country)}><Flag code={country.code} />{country.name}</li>)
            : <li className="country-empty" role="presentation">No matching country</li>}
        </ul>}
      </div>
    </div>
  )
}
