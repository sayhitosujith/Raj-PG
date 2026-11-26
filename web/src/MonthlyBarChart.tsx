import { useId, useLayoutEffect, useRef, useState } from 'react'
import { formatMonth } from './rent'
import { shortMonth } from './reports'

/**
 * The element's current width in CSS pixels. The chart draws at this width (one SVG unit = one pixel)
 * rather than scaling a fixed canvas, so its text stays 11px whether the chart is full width or half.
 */
function useWidth<T extends Element>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = (contentWidth: number) => setWidth(Math.max(200, Math.round(contentWidth)))
    // Measured once now, before the first paint, so a phone never flashes the fallback width;
    // the observer then follows later resizes. The content box excludes the figure's padding.
    const style = getComputedStyle(element)
    update(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** One measure plotted per month; at most two per chart, coloured in fixed order (blue, then orange). */
export type ChartSeries = { label: string; values: number[] }

type Props = {
  title: string
  months: string[]
  series: ChartSeries[]
  /** Stacked bars show parts of one total (e.g. rent collected + still owed = expected); grouped bars compare. */
  stacked?: boolean
  /** Exact figure for tooltips and the table. */
  format: (value: number) => string
  /** Short figure for the y-axis. */
  axisFormat?: (value: number) => string
  /** Counts (requests, move-ins): axis steps stay whole numbers, never "0.5". */
  wholeNumbers?: boolean
}

const height = 220
const plot = { top: 12, right: 8, bottom: 26, left: 52 }
const plotHeight = height - plot.top - plot.bottom
const gridLines = 4
// A month label needs about this much room; narrower bands label every second (or third) month.
const minLabelWidth = 34
// Bars stay thin however few months there are, and a 2px surface gap separates neighbours.
const maxBarWidth = 18
const barGap = 2
const cornerRadius = 4

/**
 * The smallest "nice" axis top (1, 2, 2.5 or 5 × 10ⁿ per step) that clears `value`, so gridlines land on
 * round numbers. With `wholeNumbers` a step is never below 1 and never 2.5, so counts read 0, 1, 2…
 */
function niceMax(value: number, wholeNumbers: boolean) {
  if (value <= 0) return gridLines
  const magnitude = 10 ** Math.floor(Math.log10(value / gridLines))
  const steps = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).filter((step) => !wholeNumbers || (step >= 1 && Number.isInteger(step)))
  const step = steps.find((candidate) => candidate * gridLines >= value) ?? Math.max(wholeNumbers ? 1 : 0, 10 * magnitude)
  return step * gridLines
}

/** A bar rising from `y + h` to `y`, rounded only at its data end so it stays anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number, rounded: boolean) {
  const r = rounded ? Math.min(cornerRadius, w / 2, h) : 0
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * Month-by-month bars for the Reports page, drawn in SVG like the app's other charts so no chart
 * library is needed. Hover or focus a month for its exact figures; the legend names each series (it
 * is never colour alone), and "Show as table" gives the same numbers as text. Colours come from
 * --report-series-* in App.css, chosen to stay distinct for colour-blind viewers in both themes.
 */
export function MonthlyBarChart({ title, months, series, stacked = false, format, axisFormat = format, wholeNumbers = false }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const [isTable, setIsTable] = useState(false)
  // Measured on the figure, which stays mounted in table view, so toggling back keeps tracking its width.
  const [figureRef, width] = useWidth<HTMLElement>(640)
  const titleId = useId()
  const totals = months.map((_, index) => series.reduce((sum, item) => sum + Math.max(0, item.values[index] ?? 0), 0))
  const top = niceMax(stacked ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((item) => item.values)), wholeNumbers)
  const plotWidth = width - plot.left - plot.right
  const band = plotWidth / Math.max(1, months.length)
  const labelEvery = Math.ceil(minLabelWidth / band)
  // Labels count back from the latest month, so the current month is always named.
  const isLabelled = (index: number) => (months.length - 1 - index) % labelEvery === 0
  const firstLabelled = months.findIndex((_, index) => isLabelled(index))
  const barWidth = Math.min(maxBarWidth, (band * 0.7 - barGap * (series.length - 1)) / (stacked ? 1 : series.length))
  const groupWidth = stacked ? barWidth : barWidth * series.length + barGap * (series.length - 1)
  const scale = (value: number) => (Math.max(0, value) / top) * plotHeight
  const hasData = totals.some((total) => total > 0)

  return (
    <figure ref={figureRef} className="report-chart" aria-labelledby={titleId}>
      <figcaption className="report-chart-head">
        <strong id={titleId}>{title}</strong>
        {series.length > 1 && <ul className="report-chart-legend">{series.map((item, index) => <li key={item.label}><span className={`legend-swatch report-series-${index}`} aria-hidden="true" />{item.label}</li>)}</ul>}
      </figcaption>
      {isTable ? (
        <table className="finance-table report-table">
          <thead><tr><th scope="col">Month</th>{series.map((item) => <th key={item.label} scope="col" className="is-numeric">{item.label}</th>)}{stacked && <th scope="col" className="is-numeric">Total</th>}</tr></thead>
          <tbody>{months.map((month, index) => <tr key={month}><td>{formatMonth(month)}</td>{series.map((item) => <td key={item.label} className="is-numeric">{format(item.values[index] ?? 0)}</td>)}{stacked && <td className="is-numeric">{format(totals[index])}</td>}</tr>)}</tbody>
        </table>
      ) : (
        <div className="report-chart-plot">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${months.map((month, index) => `${formatMonth(month)} ${series.map((item) => `${item.label} ${format(item.values[index] ?? 0)}`).join(', ')}`).join('; ')}`}>
            {Array.from({ length: gridLines + 1 }, (_, step) => {
              const value = (top / gridLines) * step
              const y = plot.top + plotHeight - scale(value)
              return <g key={step} className="report-chart-grid"><line x1={plot.left} x2={width - plot.right} y1={y} y2={y} /><text x={plot.left - 8} y={y} dy="0.32em" textAnchor="end">{axisFormat(value)}</text></g>
            })}
            {months.map((month, index) => {
              const x = plot.left + band * index + (band - groupWidth) / 2
              const baseline = plot.top + plotHeight
              let stackTop = baseline
              return (
                <g key={month} className={active !== null && active !== index ? 'is-dimmed' : ''}>
                  {series.map((item, seriesIndex) => {
                    const value = Math.max(0, item.values[index] ?? 0)
                    if (!value) return null
                    // A segment sitting on another gives up 2px to the surface so the parts read apart.
                    const gap = stacked && stackTop < baseline ? barGap : 0
                    const h = Math.max(1, scale(value) - gap)
                    const isTopSegment = !stacked || series.slice(seriesIndex + 1).every((later) => !(later.values[index] ?? 0))
                    const barX = stacked ? x : x + seriesIndex * (barWidth + barGap)
                    const y = stacked ? stackTop - gap - h : baseline - h
                    if (stacked) stackTop = y
                    return <path key={item.label} className={`report-bar report-series-${seriesIndex}`} d={barPath(barX, y, barWidth, h, isTopSegment)} />
                  })}
                  {isLabelled(index) && <text className="report-chart-month" x={plot.left + band * index + band / 2} y={height - 8} textAnchor="middle">{shortMonth(month, index === firstLabelled)}</text>}
                  {/* The whole month column is the hover/focus target, much larger than the thin bars. */}
                  <rect className="report-chart-hit" x={plot.left + band * index} y={plot.top} width={band} height={plotHeight} tabIndex={0} aria-label={`${formatMonth(month)}: ${series.map((item) => `${item.label} ${format(item.values[index] ?? 0)}`).join(', ')}`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
                </g>
              )
            })}
            <line className="report-chart-baseline" x1={plot.left} x2={width - plot.right} y1={plot.top + plotHeight} y2={plot.top + plotHeight} />
          </svg>
          {active !== null && (
            // Beside the month, never over its bars: to the left of months in the right half, else to the right.
            <div className="report-chart-tooltip" role="status" style={plot.left + band * (active + 0.5) > width / 2 ? { right: width - (plot.left + band * active) + 4 } : { left: plot.left + band * (active + 1) + 4 }}>
              <strong>{formatMonth(months[active])}</strong>
              {series.map((item, index) => <span key={item.label}><i className={`legend-swatch report-series-${index}`} aria-hidden="true" />{item.label}<b>{format(item.values[active] ?? 0)}</b></span>)}
              {stacked && series.length > 1 && <span className="is-total">Total<b>{format(totals[active])}</b></span>}
            </div>
          )}
          {!hasData && <p className="report-chart-empty">Nothing recorded in this period.</p>}
        </div>
      )}
      <button type="button" className="text-link report-chart-toggle" onClick={() => setIsTable((value) => !value)}>{isTable ? 'Show as chart' : 'Show as table'}</button>
    </figure>
  )
}
