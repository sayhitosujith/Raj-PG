import { useEffect } from 'react'

/**
 * Shows `title` in the browser tab while the calling screen is mounted, and puts the previous title back
 * when it unmounts, so each screen names the tab for whoever is looking at it (the business for staff,
 * the PG for a resident) without the others having to know. Nothing changes while `title` is empty, for
 * example before the name has loaded.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => { document.title = previous }
  }, [title])
}
