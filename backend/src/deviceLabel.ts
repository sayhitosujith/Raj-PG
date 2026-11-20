/**
 * A readable name for the device behind a browser user agent ("iPhone · Safari", "Windows PC · Edge"), for the owner's
 * list of where a resident is signed in. A best guess from well-known markers, not fingerprinting: anything not
 * recognised reads "Unknown device", as do sessions started before user agents were recorded.
 */
export function deviceLabel(userAgent: string | null | undefined) {
  if (!userAgent) return 'Unknown device'
  const device = /iPhone/.test(userAgent) ? 'iPhone'
    : /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent)) ? 'iPad'
    : /Android/.test(userAgent) ? (/Mobile/.test(userAgent) ? 'Android phone' : 'Android tablet')
    : /Windows/.test(userAgent) ? 'Windows PC'
    : /Macintosh|Mac OS X/.test(userAgent) ? 'Mac'
    : /CrOS/.test(userAgent) ? 'Chromebook'
    : /Linux/.test(userAgent) ? 'Linux PC'
    : null
  // Order matters: Edge, Samsung Internet and Opera also say "Chrome"; Chrome also says "Safari".
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /SamsungBrowser/.test(userAgent) ? 'Samsung Internet'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox|FxiOS/.test(userAgent) ? 'Firefox'
    : /Chrome|CriOS/.test(userAgent) ? 'Chrome'
    : /Safari/.test(userAgent) ? 'Safari'
    : null
  if (!device) return browser ?? 'Unknown device'
  return browser ? `${device} · ${browser}` : device
}
