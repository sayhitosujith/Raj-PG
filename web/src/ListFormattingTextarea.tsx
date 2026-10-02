import { useRef } from 'react'
import { applyListStyle, type ListStyle } from './listFormatting'

const tools: Array<{ style: ListStyle; label: string; title: string }> = [
  { style: 'bullet', label: '•', title: 'Bullet points' },
  { style: 'dash', label: '–', title: 'Dashes' },
  { style: 'number', label: '1.', title: 'Numbers (1. 2. 3.)' },
  { style: 'letter', label: 'a.', title: 'Letters (a. b. c.)' },
  { style: 'roman', label: 'i.', title: 'Roman numerals (i. ii. iii.)' },
  { style: 'none', label: 'Clear', title: 'Remove bullets and numbers' },
]

/**
 * A plain-text area with a small list toolbar (bullets, dashes, numbers, letters, Roman numerals,
 * clear). It acts on the selected lines, or on the whole text when nothing is selected. The text
 * stays plain, so the markers are ordinary characters and show the same wherever it is displayed.
 * Uncontrolled, like the other Settings fields, so the surrounding form reads it by `name`.
 */
export function ListFormattingTextarea({ name, label, defaultValue, maxLength, rows }: { name: string; label: string; defaultValue: string; maxLength: number; rows: number }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function format(style: ListStyle) {
    const area = textareaRef.current
    if (!area) return
    const { value, selectionStart, selectionEnd } = area
    const hasSelection = selectionStart !== selectionEnd
    // Widen the selection to whole lines, so a half-selected first or last line is still formatted.
    const start = hasSelection ? value.lastIndexOf('\n', selectionStart - 1) + 1 : 0
    const lineEnd = value.indexOf('\n', selectionEnd - (hasSelection && value[selectionEnd - 1] === '\n' ? 1 : 0))
    const end = hasSelection ? (lineEnd === -1 ? value.length : lineEnd) : value.length
    const formatted = applyListStyle(value.slice(start, end), style)
    area.focus()
    area.setRangeText(formatted, start, end, 'select')
  }

  return (
    <label className="list-format-field">{label}
      <span className="list-format-toolbar" role="toolbar" aria-label={`Format ${label.toLowerCase()} as a list`}>
        {tools.map((tool) => <button key={tool.style} type="button" className={tool.style === 'none' ? 'is-clear' : undefined} title={tool.title} aria-label={tool.title} onMouseDown={(event) => event.preventDefault()} onClick={() => format(tool.style)}>{tool.label}</button>)}
        <small>Select lines to format just those; with nothing selected the whole text is formatted.</small>
      </span>
      <textarea ref={textareaRef} name={name} maxLength={maxLength} rows={rows} defaultValue={defaultValue} />
    </label>
  )
}
