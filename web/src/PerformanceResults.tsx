import { formatMs, TARGET_MS, type TimingRow } from './perfStats'

/** The pass/fail badge and one-line summary above a results table. */
export function PerformanceVerdict({ passed, children }: { passed: boolean; children: React.ReactNode }) {
  return <p className="performance-tests-verdict"><span className={`status-pill ${passed ? 'sage' : 'coral'}`}>{passed ? 'Passed' : 'Needs attention'}</span> {children}</p>
}

/** Per-request timings; a row that misses the pass mark or had failures is shown in red. */
export function TimingTable({ rows }: { rows: TimingRow[] }) {
  return (
    <table className="finance-table performance-tests-table">
      <thead><tr><th>Request</th><th>Count</th><th>Median</th><th>Slowest 5%</th><th>Max</th><th>Failed</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label} className={row.p95 >= TARGET_MS || row.failed ? 'is-slow' : undefined}><td><strong>{row.label}</strong></td><td>{row.count}</td><td>{formatMs(row.median)}</td><td>{formatMs(row.p95)}</td><td>{formatMs(row.max)}</td><td>{row.failed}</td></tr>)}</tbody>
    </table>
  )
}
