/** One finished measurement of the device's current connection. */
export type SpeedResult = { downloadMbps: number; pingMs: number }

// Cloudflare's public speed-test endpoint: serves `bytes` of zeros, uncached, with CORS open to any origin.
const ENDPOINT = 'https://speed.cloudflare.com/__down'
const DOWNLOAD_BYTES = 5_000_000
// On a slow line the full file would take minutes; stopping here and using what arrived keeps both
// the wait and the data spent bounded.
const DOWNLOAD_CAP_MS = 8_000
const PING_SAMPLES = 3

const request = (bytes: number, signal: AbortSignal) => fetch(`${ENDPOINT}?bytes=${bytes}&r=${Math.random()}`, { cache: 'no-store', signal })

/** Lowest of a few empty round trips; the first pays for DNS and TLS, so the minimum is the real latency. */
async function measurePing(signal: AbortSignal) {
  let best = Infinity
  for (let sample = 0; sample < PING_SAMPLES; sample += 1) {
    const started = performance.now()
    const response = await request(0, signal)
    await response.arrayBuffer()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

/** Bytes per second while streaming, timed from the first byte so latency does not drag the figure down. */
async function measureDownload(signal: AbortSignal) {
  const cap = new AbortController()
  const timer = setTimeout(() => cap.abort(), DOWNLOAD_CAP_MS)
  const onOuterAbort = () => cap.abort()
  signal.addEventListener('abort', onOuterAbort)
  let received = 0
  let started = 0
  try {
    const response = await request(DOWNLOAD_BYTES, cap.signal)
    if (!response.ok || !response.body) throw new Error(`Speed test server answered ${response.status}`)
    const reader = response.body.getReader()
    started = performance.now()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
    }
  } catch (error) {
    // Hitting the time cap is a normal end; anything else (or the caller cancelling) is a real failure.
    if (signal.aborted || !cap.signal.aborted || !received) throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onOuterAbort)
  }
  const seconds = (performance.now() - started) / 1000
  return (received * 8) / seconds / 1_000_000
}

/**
 * Measures the connection the device is using right now (Wi-Fi or mobile data; a web page cannot tell
 * which). Costs up to about 5 MB. Rejects if the network fails or `signal` aborts.
 */
export async function runSpeedTest(signal: AbortSignal): Promise<SpeedResult> {
  const pingMs = await measurePing(signal)
  const downloadMbps = await measureDownload(signal)
  return { downloadMbps, pingMs }
}
