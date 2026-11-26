import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { InlineLoader } from './Loader'
import { downloadCsv } from './reports'

/** Shown until a report's first load completes, or if it fails. */
export function ReportPending({ failed }: { failed: boolean }) {
  return failed ? <p className="login-error" role="alert">This report could not be loaded. Check the connection and try Refresh.</p> : <InlineLoader label="Building the report…" />
}

/** A headline figure above a report's chart. `tone` marks a loss or money owed. */
export type ReportStat = { label: string; value: string; note?: string; tone?: 'is-loss' | 'is-profit' }

/** The row of headline figures at the top of each report. */
export function ReportStats({ stats }: { stats: ReportStat[] }) {
  return (
    <dl className="report-stats">
      {stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd className={stat.tone}>{stat.value}</dd>{stat.note && <small>{stat.note}</small>}</div>)}
    </dl>
  )
}

/**
 * One column of a {@link ReportTable}. `value` is the raw figure written to the CSV (plain numbers stay
 * summable in Excel); `cell` is how it shows on screen, defaulting to the raw value.
 */
export type ReportColumn<Row> = { label: string; value: (row: Row) => string | number; cell?: (row: Row) => ReactNode; numeric?: boolean }

/**
 * A titled report table with its own "Download CSV". The same column list drives the screen and the
 * file, so the download always matches what is shown.
 */
export function ReportTable<Row>({ title, fileName, columns, rows, empty, rowKey }: { title: string; fileName: string; columns: ReportColumn<Row>[]; rows: Row[]; empty: string; rowKey: (row: Row) => string }) {
  const download = () => downloadCsv(`${fileName}.csv`, [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => column.value(row)))])
  return (
    <section className="report-section">
      <div className="report-section-head">
        <h3>{title}</h3>
        <button type="button" className="secondary-button report-csv" onClick={download} disabled={!rows.length}><Download size={13} aria-hidden="true" /> Download CSV</button>
      </div>
      {rows.length ? (
        <div className="report-table-scroll">
          <table className="finance-table report-table">
            <thead><tr>{columns.map((column) => <th key={column.label} scope="col" className={column.numeric ? 'is-numeric' : undefined}>{column.label}</th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.label} className={column.numeric ? 'is-numeric' : undefined}>{column.cell ? column.cell(row) : column.value(row)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="report-empty">{empty}</p>}
    </section>
  )
}

/** "12%" of a whole, or "—" when there is nothing to divide by. */
export const percentOf = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : '—'
