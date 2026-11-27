import { useId, useState, type ReactNode, type Ref } from 'react'

/**
 * The shell every Reports chart sits in: title, legend (for two or more series, so colour is never the
 * only cue), the chart itself, and "Show as table" swapping it for the same figures as text. Shared so
 * each chart type only draws its marks.
 */
export function ChartFrame({ title, legend, table, children, ref }: { title: string; /** Series names in colour order (blue, then orange). */ legend: string[]; table: ReactNode; children: ReactNode; ref?: Ref<HTMLElement> }) {
  const [isTable, setIsTable] = useState(false)
  const titleId = useId()
  return (
    <figure ref={ref} className="report-chart" aria-labelledby={titleId}>
      <figcaption className="report-chart-head">
        <strong id={titleId}>{title}</strong>
        {legend.length > 1 && <ul className="report-chart-legend">{legend.map((label, index) => <li key={label}><span className={`legend-swatch report-series-${index}`} aria-hidden="true" />{label}</li>)}</ul>}
      </figcaption>
      {isTable ? table : children}
      <button type="button" className="text-link report-chart-toggle" onClick={() => setIsTable((value) => !value)}>{isTable ? 'Show as chart' : 'Show as table'}</button>
    </figure>
  )
}
