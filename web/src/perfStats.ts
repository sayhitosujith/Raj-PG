/** Timing helpers for the Performance tests page's sign-in test and its results table. */

/** Same pass mark as the k6 run: the slowest 5% under 2 seconds, fewer than 1% failed. */
export const TARGET_MS = 2000
const MAX_FAILURE_RATE = 0.01

export type Sample = { label: string; ms: number; ok: boolean }
export type TimingRow = { label: string; count: number; median: number; p95: number; max: number; failed: number }

/** Nearest-rank percentile of an ascending list. */
export const percentile = (sorted: number[], p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : 0
export const formatMs = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`

/**
 * One request, timed until its body has fully arrived. `no-store` keeps the browser cache out of it;
 * the body is returned as text for callers that need it (a sign-in's token, a profile's food plan).
 */
export async function timedFetch(path: string, init: RequestInit = {}): Promise<{ ms: number; status: number; ok: boolean; text: string }> {
  const start = performance.now()
  try {
    const response = await fetch(path, { cache: 'no-store', ...init })
    const text = await response.text()
    return { ms: performance.now() - start, status: response.status, ok: response.ok, text }
  } catch {
    return { ms: performance.now() - start, status: 0, ok: false, text: '' }
  }
}

/** Per-label timings in the order the labels are given, for the results table. */
export function timingRows(samples: Sample[], labels: readonly string[]): TimingRow[] {
  return labels.map((label) => {
    const own = samples.filter((sample) => sample.label === label)
    const times = own.map((sample) => sample.ms).sort((a, b) => a - b)
    return { label, count: own.length, median: percentile(times, 0.5), p95: percentile(times, 0.95), max: times.at(-1) ?? 0, failed: own.filter((sample) => !sample.ok).length }
  }).filter((row) => row.count > 0)
}

/** The slowest-5% time across every sample, and whether the run meets the pass mark. */
export function verdict(samples: Sample[]) {
  const p95 = percentile(samples.map((sample) => sample.ms).sort((a, b) => a - b), 0.95)
  const failed = samples.filter((sample) => !sample.ok).length
  return { p95, failed, passed: samples.length > 0 && p95 < TARGET_MS && failed / samples.length < MAX_FAILURE_RATE }
}
