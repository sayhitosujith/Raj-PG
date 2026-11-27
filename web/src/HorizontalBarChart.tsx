import { ChartFrame } from './ChartFrame'

/**
 * One row: its label and up to two values, drawn left to right as one stacked bar (e.g. beds taken,
 * then free) or a single bar. `segments` order sets the colour order (blue, then orange).
 */
export type BarRow = { key: string; label: string; values: number[] }

/**
 * Rows compared on one scale, for categories and properties, where long names read better on their
 * own line than squeezed under a column. Plain HTML, so it reflows on phones without measuring.
 * Each row's figure is printed beside its bar (and read out with it), so nothing depends on hover.
 * Sorted largest first unless `keepOrder`, so the ranking reads at a glance.
 */
export function HorizontalBarChart({ title, rows, segments, format, total, keepOrder = false, fillRow = false, empty }: {
  title: string
  rows: BarRow[]
  /** Names of the values in each row, in colour order; one name draws a single bar per row. */
  segments: string[]
  format: (value: number) => string
  /** What is printed beside a row; defaults to the sum of its values. */
  total?: (row: BarRow) => string
  keepOrder?: boolean
  /** Every row fills the full width, so rows compare as shares (occupancy %) rather than sizes. */
  fillRow?: boolean
  empty: string
}) {
  const sumOf = (row: BarRow) => row.values.reduce((sum, value) => sum + Math.max(0, value), 0)
  const sorted = keepOrder ? rows : [...rows].sort((a, b) => sumOf(b) - sumOf(a))
  const largest = Math.max(0, ...rows.map(sumOf))
  const label = (row: BarRow) => total ? total(row) : format(sumOf(row))

  const table = (
    <table className="finance-table report-table">
      <thead><tr><th scope="col">{title}</th>{segments.map((name) => <th key={name} scope="col" className="is-numeric">{name}</th>)}</tr></thead>
      <tbody>{sorted.map((row) => <tr key={row.key}><td>{row.label}</td>{segments.map((name, index) => <td key={name} className="is-numeric">{format(row.values[index] ?? 0)}</td>)}</tr>)}</tbody>
    </table>
  )

  return (
    <ChartFrame title={title} legend={segments} table={table}>
      {largest ? (
        <ul className="report-hbars">
          {sorted.map((row) => (
            <li key={row.key} aria-label={`${row.label}: ${segments.map((name, index) => `${name} ${format(row.values[index] ?? 0)}`).join(', ')}`}>
              <span className="report-hbar-label" aria-hidden="true">{row.label}</span>
              <span className="report-hbar-track" aria-hidden="true">
                {row.values.map((value, index) => value > 0 && <i key={segments[index] ?? index} className={`report-series-${index}`} style={{ width: `${(value / (fillRow ? sumOf(row) : largest)) * 100}%` }} title={`${segments[index]}: ${format(value)}`} />)}
              </span>
              <b className="report-hbar-value" aria-hidden="true">{label(row)}</b>
            </li>
          ))}
        </ul>
      ) : <p className="report-empty">{empty}</p>}
    </ChartFrame>
  )
}
