import { CloudOff, Wifi } from 'lucide-react'
import { useNetworkStatus } from './networkStatus'

/** "10:42", or "12 Nov, 10:42" when the saved data is from an earlier day. */
function savedTimeLabel(savedAt: number) {
  const saved = new Date(savedAt)
  const sameDay = saved.toDateString() === new Date().toDateString()
  return saved.toLocaleString(undefined, sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * A strip at the top of every page while the connection is missing or too slow, saying that what is
 * on screen may be out of date and from when. It is in the page flow rather than fixed, so it never
 * covers the resident portal's bottom tabs or the owner's toasts. Hidden when everything is live.
 */
export function OfflineBanner() {
  const { online, savedDataFrom } = useNetworkStatus()
  if (online && savedDataFrom === null) return null
  const when = savedDataFrom === null ? '' : ` from ${savedTimeLabel(savedDataFrom)}`
  const Icon = online ? Wifi : CloudOff
  return (
    <p className={`connection-banner${online ? ' is-slow' : ''}`} role="status" aria-live="polite">
      <Icon size={15} aria-hidden="true" />
      {online
        ? <span>Slow connection. Showing saved data{when} while the latest loads.</span>
        : <span>You're offline. Showing saved data{when}. Changes need a connection.</span>}
    </p>
  )
}
