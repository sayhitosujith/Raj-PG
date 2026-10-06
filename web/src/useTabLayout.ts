import { useEffect, useState } from 'react'

/** The width up to which the resident portal uses its phone/tablet tab layout; matches App.css. */
const tabLayoutQuery = '(max-width: 1024px)'

/**
 * Whether the resident portal is in its tab layout (phones and tablets), kept current as the window
 * is resized or the tablet rotated. For behaviour CSS cannot express, such as where a tap leads.
 */
export function useTabLayout() {
  const [isTabLayout, setIsTabLayout] = useState(() => window.matchMedia(tabLayoutQuery).matches)
  useEffect(() => {
    const query = window.matchMedia(tabLayoutQuery)
    const update = () => setIsTabLayout(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isTabLayout
}
