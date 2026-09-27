import { MapPin } from 'lucide-react'

/**
 * Where a property's location should open. Owners may type an area ("Whitefield, Bengaluru") or
 * paste a map link; a link opens as-is under the label "Location", text opens a map search.
 * Only http(s) links count as links, so a pasted value can never become a javascript: URL.
 */
function locationTarget(property: string, location: string) {
  const value = location.trim()
  if (/^https?:\/\//i.test(value)) return { href: value, label: 'Location' }
  return { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property}, ${value}`)}`, label: value }
}

/**
 * A property's location as a map link that opens in a new tab. The click stops here so a link
 * inside a clickable row or card (expand, open property) does not also trigger that.
 */
export function LocationLink({ property, location, className }: { property: string; location: string; className?: string }) {
  const { href, label } = locationTarget(property, location)
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer" title="Open in Google Maps" onClick={(event) => event.stopPropagation()}><MapPin size={14} aria-hidden="true" />{label}</a>
}
