// Identifies this browser to the server on every API call, for the owner's list of where a resident is signed in
// (backend sessionDevice.ts). A browser cannot read a MAC address or serial number, so the device is identified by a
// random ID kept in this browser, plus the phone model where the browser reports it (Chromium on Android).

const storageKey = 'staynest-device-id'
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001f\u007f]/g

type UserAgentData = { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> }

let deviceId: string | undefined
let deviceModel: string | undefined

// randomUUID only exists in secure contexts; a phone testing the dev server over plain http on the LAN still needs an ID.
function newDeviceId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Kept for good in this browser so every sign-in from it shares one ID. Storage can be blocked (private mode, site
// data off); the ID then lasts as long as the page, which still names this one session correctly.
function readDeviceId() {
  if (deviceId) return deviceId
  try {
    const stored = localStorage.getItem(storageKey)
    deviceId = stored && /^[A-Za-z0-9-]{8,64}$/.test(stored) ? stored : newDeviceId()
    if (deviceId !== stored) localStorage.setItem(storageKey, deviceId)
  } catch {
    deviceId ??= newDeviceId()
  }
  return deviceId
}

/** A reported phone model as it may be sent: control characters removed, trimmed, at most 60 characters; empty is none. */
export function cleanModel(model: string | undefined) {
  return model?.replace(controlCharacters, '').trim().slice(0, 60).trim() || undefined
}

/**
 * Whether a fetch goes to this app's own API, the only requests that get the device headers: a third party (maps,
 * payment pages) must never see the device ID.
 */
export function isOwnApiRequest(url: string, pageUrl: string) {
  try {
    const parsed = new URL(url, pageUrl)
    return parsed.origin === new URL(pageUrl).origin && parsed.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

/**
 * The request's headers with the device headers added. Headers the caller set win; with a Request and no `init`
 * headers, the Request's own are kept, since passing `init.headers` to fetch replaces them.
 */
export function withDeviceHeaders(input: RequestInfo | URL, init: RequestInit | undefined, device: { id: string; model?: string }) {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (!headers.has('X-Device-Id')) headers.set('X-Device-Id', device.id)
  if (device.model && !headers.has('X-Device-Model')) headers.set('X-Device-Model', device.model)
  return headers
}

/**
 * Wraps window.fetch once at start-up so every API call carries the device headers, rather than each of the app's
 * many fetch calls adding them. The phone model is looked up once in the background; calls made before it arrives go
 * without it, and the server fills it in on a later call.
 */
export function installDeviceHeaders() {
  const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData
  userAgentData?.getHighEntropyValues?.(['model']).then((values) => { deviceModel = cleanModel(values.model) }, () => undefined)
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!isOwnApiRequest(url, window.location.href)) return nativeFetch(input, init)
    return nativeFetch(input, { ...init, headers: withDeviceHeaders(input, init, { id: readDeviceId(), model: deviceModel }) })
  }
}
