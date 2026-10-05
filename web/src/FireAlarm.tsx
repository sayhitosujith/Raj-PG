import { useCallback, useEffect, useRef, useState } from 'react'
import { BellOff, Flame, Phone, ShieldCheck } from 'lucide-react'
import { readApiError } from './superAdmin'

/** An active fire alarm, as both portals receive it. */
export type FireAlert = { id: string; propertyId: string; raisedByName: string; createdAt: string; property: { name: string } }

// Alarms must reach people fast, so this polls on its own timer rather than waiting on the page refresh.
const pollMs = 10_000

/** The active alarm(s) from `url`, re-checked every 10 seconds; `refresh` re-checks at once. */
export function useFireAlerts(url: string) {
  const [alerts, setAlerts] = useState<FireAlert[]>([])
  const refresh = useCallback(() => {
    fetch(url).then((response) => (response.ok ? response.json() as Promise<{ alert?: FireAlert | null; alerts?: FireAlert[] }> : null)).then((body) => {
      if (body) setAlerts(body.alerts ?? (body.alert ? [body.alert] : []))
    }, () => undefined)
  }, [url])
  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, pollMs)
    return () => window.clearInterval(timer)
  }, [refresh])
  return { alerts, refresh }
}

/**
 * A siren made in the browser (no sound file): a square wave sweeping up and down every second.
 * Browsers only allow sound after the person has tapped the page, so `needsTap` reports when it is
 * still waiting for that; the first tap anywhere then starts it.
 */
function useSiren(isOn: boolean) {
  const [needsTap, setNeedsTap] = useState(false)
  const contextRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    if (!isOn) return
    const context = new AudioContext()
    contextRef.current = context
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'square'
    gain.gain.value = 0.18
    oscillator.connect(gain).connect(context.destination)
    const sweep = () => {
      const now = context.currentTime
      oscillator.frequency.setValueAtTime(650, now)
      oscillator.frequency.linearRampToValueAtTime(1300, now + 0.5)
      oscillator.frequency.linearRampToValueAtTime(650, now + 1)
    }
    sweep()
    oscillator.start()
    const sweeper = window.setInterval(sweep, 1000)
    const resume = () => { void context.resume().then(() => setNeedsTap(context.state !== 'running')) }
    resume()
    document.addEventListener('pointerdown', resume)
    document.addEventListener('keydown', resume)
    return () => {
      window.clearInterval(sweeper)
      document.removeEventListener('pointerdown', resume)
      document.removeEventListener('keydown', resume)
      oscillator.stop()
      void context.close()
      contextRef.current = null
      setNeedsTap(false)
    }
  }, [isOn])
  return needsTap
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/**
 * Full-screen flashing alarm with siren while any alarm is active. "Silence" stops the sound and
 * shrinks it to a red bar (tap to reopen), so people can still use their phone. `onClear` (owners
 * only) ends the alarm for everyone once the building is safe.
 */
export function FireAlarmOverlay({ alerts, onClear }: { alerts: FireAlert[]; onClear?: (alert: FireAlert) => Promise<string | null> }) {
  const [silencedId, setSilencedId] = useState<string | null>(null)
  const [isMinimised, setIsMinimised] = useState(false)
  const [error, setError] = useState('')
  const alert = alerts[0]
  // A new alarm (different id) sounds again even if an earlier one was silenced.
  const isSounding = Boolean(alert) && silencedId !== alert?.id
  const needsTap = useSiren(isSounding)
  useEffect(() => { if (alert && silencedId !== alert.id) setIsMinimised(false) }, [alert, silencedId])
  if (!alert) return null

  const places = alerts.map((item) => item.property.name).join(', ')
  if (isMinimised) return <button type="button" className="fire-alarm-bar" onClick={() => setIsMinimised(false)}><Flame size={16} /> FIRE ALARM at {places} · tap for details</button>

  async function clear() {
    if (!onClear || !window.confirm(`Clear the fire alarm at ${alert.property.name}? Only do this once everyone is safe and the fire service says so.`)) return
    setError((await onClear(alert)) ?? '')
  }

  return (
    <div className="fire-alarm" role="alertdialog" aria-modal="true" aria-labelledby="fire-alarm-title" aria-describedby="fire-alarm-text">
      <div className="fire-alarm-card">
        <span className="fire-alarm-icon"><Flame size={44} /></span>
        <h2 id="fire-alarm-title">FIRE ALARM</h2>
        <p className="fire-alarm-place">{places}</p>
        <p id="fire-alarm-text">Leave the building now by the nearest exit. Do not use the lift. Help others out if you can, and stay outside until it is declared safe.</p>
        <p className="fire-alarm-meta">Raised by {alert.raisedByName} at {timeOf(alert.createdAt)}</p>
        {needsTap && <p className="fire-alarm-tap">Tap anywhere to sound the alarm</p>}
        <div className="fire-alarm-actions">
          <a className="fire-alarm-call" href="tel:101"><Phone size={16} /> Call 101 (fire)</a>
          <a className="fire-alarm-call" href="tel:112"><Phone size={16} /> Call 112</a>
        </div>
        <div className="fire-alarm-actions">
          <button type="button" className="fire-alarm-secondary" onClick={() => { setSilencedId(alert.id); setIsMinimised(true) }}><BellOff size={15} /> Silence alarm</button>
          {onClear && <button type="button" className="fire-alarm-secondary" onClick={() => void clear()}><ShieldCheck size={15} /> Clear alarm (safe)</button>}
        </div>
        {error && <p className="fire-alarm-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}

/** POSTs `url` to raise the alarm, after a confirm so it is not set off by a stray tap. */
async function raise(url: string, body: object | undefined, place: string, onRaised: () => void, onError: (message: string) => void) {
  if (!window.confirm(`Raise the FIRE ALARM${place}? Everyone there will be alerted with a siren, email and WhatsApp.`)) return
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
    if (!response.ok) { onError(await readApiError(response, 'The alarm could not be raised. Call 101 or 112 now.')); return }
    onRaised()
  } catch {
    onError('Could not reach the server. Call 101 or 112 now.')
  }
}

/** The resident's "Report fire" button; raises the alarm for their own property. */
export function ReportFireButton({ onRaised, onNotice }: { onRaised: () => void; onNotice: (message: string) => void }) {
  return <button type="button" className="report-fire-button" onClick={() => void raise('/api/resident-portal/fire-alert', undefined, ' for your building', onRaised, onNotice)}><Flame size={14} /> Report fire</button>
}

/** The owner's "Fire alarm" control: choose the property, then raise its alarm. */
export function RaiseFireAlarmButton({ properties, onRaised, onNotice }: { properties: Array<{ id?: string; name: string }>; onRaised: () => void; onNotice: (message: string) => void }) {
  const [isChoosing, setIsChoosing] = useState(false)
  const choices = properties.filter((property): property is { id: string; name: string } => Boolean(property.id))
  return (
    <div className="raise-fire">
      <button type="button" className="report-fire-button" aria-expanded={isChoosing} onClick={() => setIsChoosing((open) => !open)}><Flame size={14} /> Fire alarm</button>
      {isChoosing && <div className="raise-fire-menu" role="menu">
        <p>Raise the alarm for:</p>
        {choices.length ? choices.map((property) => <button key={property.id} type="button" role="menuitem" onClick={() => { setIsChoosing(false); void raise('/api/fire-alerts', { propertyId: property.id }, ` at ${property.name}`, onRaised, onNotice) }}><Flame size={13} /> {property.name}</button>)
          : <p>No properties yet.</p>}
      </div>}
    </div>
  )
}
