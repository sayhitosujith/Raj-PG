import { useSyncExternalStore } from 'react'

/**
 * What the app knows about the connection: whether the browser is offline, and the time of the saved
 * data the service worker last answered with because the network failed or was too slow (null once a
 * live answer arrives again). `public/sw.js` posts those two message types; the browser's online and
 * offline events cover the rest.
 */
export type NetworkStatus = { online: boolean; savedDataFrom: number | null }

type ServiceWorkerMessage = { type: 'served-saved'; savedAt: number } | { type: 'served-live' }

let status: NetworkStatus = { online: typeof navigator === 'undefined' || navigator.onLine, savedDataFrom: null }
const listeners = new Set<() => void>()

function update(next: Partial<NetworkStatus>) {
  if (Object.entries(next).every(([key, value]) => status[key as keyof NetworkStatus] === value)) return
  status = { ...status, ...next }
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => update({ online: true }))
  window.addEventListener('offline', () => update({ online: false }))
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent<ServiceWorkerMessage>) => {
    if (event.data?.type === 'served-saved') update({ savedDataFrom: event.data.savedAt })
    else if (event.data?.type === 'served-live') update({ savedDataFrom: null })
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The current connection status; re-renders when it changes. */
export function useNetworkStatus() {
  return useSyncExternalStore(subscribe, () => status)
}

/** Whether the browser reports no connection at all (background refreshes skip their requests then). */
export const isOffline = () => !status.online

/** Chrome/Android's Network Information API; absent in Safari and Firefox, where nothing is throttled. */
type ConnectionInfo = { saveData?: boolean; effectiveType?: string }

/**
 * True on 2G, or when the person turned on Data Saver: background polling then slows down so it does
 * not compete with what they are actually opening. Browsers without the API are treated as fast.
 */
export function isSlowConnection() {
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection
  return Boolean(connection && (connection.saveData || connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g'))
}
