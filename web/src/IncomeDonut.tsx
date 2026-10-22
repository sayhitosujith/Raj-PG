import { useState } from 'react'
import { expenseCategoryLabels, type ExpenseCategory, type FinanceSummary } from './finance'
import { formatRupees } from './rent'

/**
 * "Where this month's income went": one slice per expense category plus a Profit slice for what
 * is left. A pie cannot show a negative, so in a loss month the ring is the expenses instead, split
 * into the part income covered (green) and the loss (red), with the categories listed beside it.
 * Income, expenses and profit or loss are always totalled under the legend. Colours are fixed per
 * part (never by size): expenses in shades of red, profit in green, in App.css (--slice-*).
 */
type Slice = { key: ExpenseCategory | 'profit' | 'covered' | 'loss'; label: string; amount: number }

const radius = 70
const stroke = 24
const circumference = 2 * Math.PI * radius
// 2px of surface between neighbouring slices, measured along the ring.
const gap = 2

export function IncomeDonut({ summary }: { summary: FinanceSummary }) {
  const [active, setActive] = useState<Slice['key'] | null>(null)
  const [isTable, setIsTable] = useState(false)
  const isLoss = summary.profit < 0
  const categories: Slice[] = (Object.keys(expenseCategoryLabels) as ExpenseCategory[])
    .map((key) => ({ key, label: expenseCategoryLabels[key], amount: summary.expensesByCategory[key] }))
    .filter((slice) => slice.amount > 0)
  const slices: Slice[] = (isLoss
    ? [{ key: 'covered' as const, label: 'Covered by income', amount: summary.income }, { key: 'loss' as const, label: 'Loss', amount: -summary.profit }]
    : [...categories, { key: 'profit' as const, label: 'Profit', amount: summary.profit }]
  ).filter((slice) => slice.amount > 0)
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0)
  const percent = (amount: number) => (total ? Math.round((amount / total) * 100) : 0)

  if (!total) return <div className="finance-donut is-empty"><p>No income or expenses recorded for this month yet.</p></div>

  let offset = 0
  const arcs = slices.map((slice) => {
    const length = (slice.amount / total) * circumference
    const arc = { ...slice, dash: slices.length > 1 ? Math.max(length - gap, 0.5) : length, offset }
    offset += length
    return arc
  })
  const focus = slices.find((slice) => slice.key === active)

  return (
    <div className="finance-donut">
      <div className="finance-donut-chart">
        <svg viewBox="0 0 180 180" role="img" aria-label={`${isLoss ? 'Expenses' : 'Income split'} for the month: ${slices.map((slice) => `${slice.label} ${formatRupees(slice.amount)}`).join(', ')}`}>
          <g transform="rotate(-90 90 90)">
            {arcs.map((arc) => (
              <circle key={arc.key} className={`donut-slice slice-${arc.key}${active && active !== arc.key ? ' is-dimmed' : ''}`} cx="90" cy="90" r={radius} fill="none" strokeWidth={stroke} strokeDasharray={`${arc.dash} ${circumference}`} strokeDashoffset={-arc.offset} onMouseEnter={() => setActive(arc.key)} onMouseLeave={() => setActive(null)} />
            ))}
          </g>
        </svg>
        {/* The centre doubles as the hover readout, so nothing floats over the ring. */}
        <div className="finance-donut-centre" aria-live="polite">
          {focus ? <><small>{focus.label}</small><strong>{formatRupees(focus.amount)}</strong><small>{percent(focus.amount)}% of {isLoss ? 'expenses' : 'income'}</small></>
            : <><small>{isLoss ? 'Loss' : 'Profit'}</small><strong className={isLoss ? 'is-loss' : 'is-profit'}>{isLoss ? '−' : ''}{formatRupees(Math.abs(summary.profit))}</strong><small>{isLoss ? 'expenses exceed income' : `of ${formatRupees(summary.income)} income`}</small></>}
        </div>
      </div>
      <div className="finance-donut-side">
        <p className="finance-donut-title">{isLoss ? 'Expenses: covered by income vs loss' : 'Where this month’s income went'}</p>
        {isTable ? (
          <table className="finance-table">
            <thead><tr><th scope="col">Part</th><th scope="col">Amount</th><th scope="col">Share</th></tr></thead>
            <tbody>{slices.map((slice) => <tr key={slice.key}><td>{slice.label}</td><td>{formatRupees(slice.amount)}</td><td>{percent(slice.amount)}%</td></tr>)}</tbody>
          </table>
        ) : (
          <ul className="finance-legend">{slices.map((slice) => (
            <li key={slice.key}><button type="button" className={active === slice.key ? 'is-active' : ''} onMouseEnter={() => setActive(slice.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(slice.key)} onBlur={() => setActive(null)}>
              <span className={`legend-swatch slice-${slice.key}`} aria-hidden="true" /><span className="legend-label">{slice.label}</span><span className="legend-value">{formatRupees(slice.amount)} · {percent(slice.amount)}%</span>
            </button></li>
          ))}</ul>
        )}
        {isLoss && categories.length > 0 && <ul className="finance-breakdown" aria-label="Expenses by category">{categories.map((slice) => <li key={slice.key}><span>{slice.label}</span><span>{formatRupees(slice.amount)} · {Math.round((slice.amount / summary.expenses) * 100)}%</span></li>)}</ul>}
        <dl className="finance-totals">
          <div><dt>Income</dt><dd>{formatRupees(summary.income)}</dd></div>
          <div><dt>Expenses</dt><dd>{formatRupees(summary.expenses)}</dd></div>
          <div className={isLoss ? 'is-loss' : 'is-profit'}><dt>{isLoss ? 'Loss' : 'Profit'}</dt><dd>{isLoss ? '−' : ''}{formatRupees(Math.abs(summary.profit))}</dd></div>
        </dl>
        <button type="button" className="text-link finance-table-toggle" onClick={() => setIsTable((value) => !value)}>{isTable ? 'Show as chart legend' : 'Show as table'}</button>
      </div>
    </div>
  )
}
