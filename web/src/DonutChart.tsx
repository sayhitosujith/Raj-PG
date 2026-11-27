import { useState } from 'react'
import { ChartFrame } from './ChartFrame'

/** One part of the whole; at most two per donut, coloured in fixed order (blue, then orange). */
export type DonutSlice = { label: string; value: number }

const size = 180
const radius = 70
const stroke = 22
const circumference = 2 * Math.PI * radius
// 2px of surface between the slices, measured along the ring.
const gap = 2

/**
 * A part-to-whole ring for the Reports page (e.g. rent collected vs still owed). The centre shows the
 * headline (`centre`), or the hovered or focused slice with its share; the legend beside it lists each
 * slice with its figure, so the split is never read from colour alone.
 */
export function DonutChart({ title, slices, format, centre }: { title: string; slices: DonutSlice[]; format: (value: number) => string; /** What the middle says when nothing is hovered, e.g. "100%" / "collected". */ centre: { value: string; label: string } }) {
  const [active, setActive] = useState<number | null>(null)
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0)
  const share = (value: number) => (total ? `${Math.round((value / total) * 100)}%` : '—')
  const shown = slices.map((slice, index) => ({ ...slice, index })).filter((slice) => slice.value > 0)
  let offset = 0
  const arcs = shown.map((slice) => {
    const length = (slice.value / total) * circumference
    const arc = { ...slice, dash: shown.length > 1 ? Math.max(length - gap, 0.5) : length, offset }
    offset += length
    return arc
  })
  const focus = active === null ? null : slices[active]

  const table = (
    <table className="finance-table report-table">
      <thead><tr><th scope="col">Part</th><th scope="col" className="is-numeric">Amount</th><th scope="col" className="is-numeric">Share</th></tr></thead>
      <tbody>{slices.map((slice) => <tr key={slice.label}><td>{slice.label}</td><td className="is-numeric">{format(slice.value)}</td><td className="is-numeric">{share(slice.value)}</td></tr>)}</tbody>
    </table>
  )

  return (
    <ChartFrame title={title} legend={[]} table={table}>
      <div className="report-donut">
        <div className="report-donut-ring">
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${title}: ${slices.map((slice) => `${slice.label} ${format(slice.value)} (${share(slice.value)})`).join(', ')}`}>
            <circle className="report-donut-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {arcs.map((arc) => <circle key={arc.label} className={`report-donut-slice report-series-${arc.index}${active !== null && active !== arc.index ? ' is-dimmed' : ''}`} cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeDasharray={`${arc.dash} ${circumference}`} strokeDashoffset={-arc.offset} onMouseEnter={() => setActive(arc.index)} onMouseLeave={() => setActive(null)} />)}
            </g>
          </svg>
          {/* The centre doubles as the hover readout, so nothing floats over the ring. */}
          <div className="report-donut-centre" aria-live="polite">
            {focus ? <><strong>{share(focus.value)}</strong><small>{focus.label}</small></> : <><strong>{total ? centre.value : '—'}</strong><small>{total ? centre.label : 'nothing yet'}</small></>}
          </div>
        </div>
        <ul className="report-donut-legend">
          {slices.map((slice, index) => (
            <li key={slice.label}><button type="button" className={active === index ? 'is-active' : ''} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}>
              <span className={`legend-swatch report-series-${index}`} aria-hidden="true" /><span>{slice.label}</span><b>{format(slice.value)}</b><small>{share(slice.value)}</small>
            </button></li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  )
}
