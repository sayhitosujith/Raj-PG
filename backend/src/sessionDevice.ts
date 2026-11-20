import { isIP } from 'node:net'

/** What a sign-in records about the device behind it, for the owner's list of where a resident is signed in. */
export type SessionDevice = { userAgent: string | null; deviceId: string | null; deviceModel: string | null; ipAddress: string | null; location: string | null }

/** The parts of an Express request this module reads; narrow so the parsing can be tested without a server. */
export type DeviceRequest = { get(name: string): string | undefined; ip?: string }

const deviceIdPattern = /^[A-Za-z0-9-]{8,64}$/
const controlCharacters = /[\u0000-\u001f\u007f]/g

// Every header here is the client's (or a proxy's) to send, so each is capped and cleaned before it is stored.
function cleanText(value: string | undefined, maxLength: number) {
  const text = value?.replace(controlCharacters, '').trim().slice(0, maxLength).trim()
  return text || null
}

/**
 * Reads the device details from a request: the user agent, the web app's random per-browser ID (X-Device-Id), the
 * phone model where the browser offers it (X-Device-Model), and the caller's IP address and approximate area. Used at
 * sign-in and when a session is used, so both record the same thing. Anything malformed is dropped, not stored.
 */
export function deviceDetailsFrom(request: DeviceRequest): SessionDevice {
  const deviceId = request.get('x-device-id')?.trim()
  return {
    userAgent: request.get('user-agent')?.slice(0, 300) || null,
    deviceId: deviceId && deviceIdPattern.test(deviceId) ? deviceId : null,
    deviceModel: cleanText(request.get('x-device-model'), 60),
    ipAddress: clientIp(request),
    location: areaFromNetlifyGeo(request.get('x-nf-geo')),
  }
}

/**
 * The caller's IP address. In production Netlify proxies /api to Render, so the address the server sees is a proxy's:
 * Netlify's own client header is preferred, then the first X-Forwarded-For entry, then the socket. These headers are
 * not authenticated (a caller reaching Render directly can set them), which is acceptable for a display-only hint.
 */
export function clientIp(request: DeviceRequest) {
  const candidates = [request.get('x-nf-client-connection-ip'), request.get('x-forwarded-for')?.split(',')[0], request.ip]
  for (const candidate of candidates) {
    const ip = candidate?.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '')
    if (ip && ip.length <= 45 && isIP(ip)) return ip
  }
  return null
}

/**
 * "City, Region, CC" from Netlify's geolocation header (base64 JSON), the only source of an area: no third-party
 * geo-IP service is called. Absent off Netlify (local development, direct calls to Render), and anything that does
 * not decode to the expected shape is ignored.
 */
export function areaFromNetlifyGeo(header: string | undefined) {
  if (!header) return null
  try {
    const geo: unknown = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    if (!geo || typeof geo !== 'object') return null
    const { city, subdivision, country } = geo as { city?: unknown; subdivision?: { code?: unknown; name?: unknown }; country?: { code?: unknown; name?: unknown } }
    const parts = [city, subdivision?.code ?? subdivision?.name, country?.code ?? country?.name]
      .map((part) => (typeof part === 'string' ? cleanText(part, 40) : null))
      .filter((part): part is string => Boolean(part))
    return cleanText(parts.join(', '), 80)
  } catch {
    return null
  }
}

/**
 * The details a session should pick up because it lacks them: a session signed in before they were recorded, or
 * before the browser had looked up its phone model (that lookup is asynchronous), fills them in on later use.
 * Never overwrites a stored value, so one session keeps one device identity.
 */
export function missingDeviceDetails(stored: Pick<SessionDevice, 'userAgent' | 'deviceId' | 'deviceModel'>, current: SessionDevice) {
  return {
    ...(!stored.userAgent && current.userAgent ? { userAgent: current.userAgent } : {}),
    ...(!stored.deviceId && current.deviceId ? { deviceId: current.deviceId } : {}),
    ...(!stored.deviceModel && current.deviceModel ? { deviceModel: current.deviceModel } : {}),
  }
}

/** "Device A3F9": enough of the random ID for the owner to see that two sign-ins came from the same browser. */
export function shortDeviceId(deviceId: string | null) {
  return deviceId ? `Device ${deviceId.replace(/-/g, '').slice(0, 4).toUpperCase()}` : null
}

/**
 * The IP address as shown to the owner. Loopback and private addresses (local development, a proxy on the same
 * network) say "local network", as the number itself would mean nothing to them.
 */
export function displayIp(ip: string | null) {
  if (!ip) return null
  return isLocalAddress(ip) ? 'local network' : ip
}

function isLocalAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  const lower = ip.toLowerCase()
  return lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)
}
