/**
 * A readable name for the device behind a browser user agent ("iPhone · Safari", "Windows PC · Edge"), for the owner's
 * list of where a resident is signed in. A best guess from well-known markers, not fingerprinting: anything not
 * recognised reads "Unknown device". A session with none recorded (signed in before devices were, and not used since)
 * says so rather than guessing. The phone model, which some browsers report separately (sessionDevice.ts), is added
 * when known ("Android phone · Chrome · Pixel 8").
 */
export function deviceLabel(userAgent: string | null | undefined, model?: string | null) {
  if (!userAgent) return 'Earlier sign-in (device not recorded)'
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
  const name = !device ? browser ?? 'Unknown device' : browser ? `${device} · ${browser}` : device
  return model ? `${name} · ${model}` : name
}
