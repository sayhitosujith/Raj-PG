import { useId, useState } from 'react'
import { countries, type Country } from './countries'
import { CountryCombobox } from './CountryCombobox'

/**
 * A labelled nationality field. The chosen ISO code is submitted through a hidden input, so the
 * field works with FormData like any other; a country is always selected. `onChange` lets a form
 * react to the choice, e.g. to swap Aadhaar fields for passport ones.
 */
export function CountrySelect({ name, label, defaultCode, onChange }: { name: string; label: string; defaultCode: string; onChange?: (country: Country) => void }) {
  const inputId = useId()
  const [selected, setSelected] = useState<Country>(() => countries.find((country) => country.code === defaultCode) ?? countries[0])

  function select(country: Country) {
    setSelected(country)
    onChange?.(country)
  }

  return (
    <div className="country-field">
      <label htmlFor={inputId}>{label}</label>
      <CountryCombobox options={countries} selected={selected} onSelect={select} label={label} inputId={inputId} />
      <input type="hidden" name={name} value={selected.code} />
    </div>
  )
}
