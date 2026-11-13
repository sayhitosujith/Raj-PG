import { useEffect, useRef, useState } from 'react'
import { Gauge, RefreshCw } from 'lucide-react'
import { useNetworkStatus } from './networkStatus'
import { runSpeedTest, type SpeedResult } from './speedTest'

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'done'; result: SpeedResult } | { kind: 'failed' }

/** Chrome/Android's Data Saver flag; absent elsewhere. */
const prefersSavingData = () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)

const formatMbps = (mbps: number) => (mbps >= 10 ? Math.round(mbps).toString() : mbps.toFixed(1))

/**
 * A row on the Wi-Fi card with the device's current download speed and ping, measured when the card
 * appears, when the connection comes back, and on tap. Labelled "Your connection" because the browser
 * cannot see whether the phone is actually on the property's Wi-Fi. Not run automatically when Data
 * Saver is on, since each test downloads up to about 5 MB.
 */
export function ConnectionSpeed() {
  const { online } = useNetworkStatus()
  // Remounting on a change of `online` starts a fresh automatic test when the connection returns.
  return <SpeedReading key={String(online)} online={online} />
}

function SpeedReading({ online }: { online: boolean }) {
  const autoRun = online && !prefersSavingData()
  const [state, setState] = useState<TestState>(() => (autoRun ? { kind: 'testing' } : { kind: 'idle' }))
  const running = useRef<AbortController | null>(null)

  // Leaves the 'testing' state to the caller, so the automatic run can start without a set-state in the effect.
  function measure() {
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    runSpeedTest(controller.signal).then(
      (result) => { if (!controller.signal.aborted) setState({ kind: 'done', result }) },
      () => { if (!controller.signal.aborted) setState({ kind: 'failed' }) },
    )
  }

  function retest() {
    setState({ kind: 'testing' })
    measure()
  }

  useEffect(() => {
    if (autoRun) measure()
    return () => running.current?.abort()
    // Runs once per mount; the parent's key remounts this when `online` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  let reading: string
  if (!online) reading = 'Offline'
  else if (state.kind === 'testing') reading = 'Testing…'
  else if (state.kind === 'done') reading = `${formatMbps(state.result.downloadMbps)} Mbps · ${Math.round(state.result.pingMs)} ms`
  else if (state.kind === 'failed') reading = 'Could not test'
  else reading = 'Not tested'

  return (
    <div className="info-line connection-speed">
      <span><Gauge size={12} /> Your connection</span>
      <strong aria-live="polite">{reading}</strong>
      <button type="button" className="icon-button" aria-label="Test internet speed again" disabled={!online || state.kind === 'testing'} onClick={retest}>
        <RefreshCw size={14} className={state.kind === 'testing' ? 'is-spinning' : undefined} />
      </button>
    </div>
  )
}
