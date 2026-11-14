import { useEffect, type RefObject } from 'react'

const transparent = 'rgba(0, 0, 0, 0)'

/**
 * The colour the header shows at the top, as "rgb(…)": its plain background if it has one, or for the
 * gradient (theme-colour) header its starting colour, var(--brand).
 */
function headerColour(header: HTMLElement) {
  const background = getComputedStyle(header).backgroundColor
  if (background && background !== transparent) return background
  // A gradient leaves background-color transparent. The theme colour may be a hex, a named colour or a
  // color-mix(); a throwaway child resolves it to plain rgb(), which every phone accepts for theme-color.
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--brand)'
  header.appendChild(probe)
  const colour = getComputedStyle(probe).color
  probe.remove()
  return colour
}

/**
 * Colours the phone's status bar (and the browser bar on Android) like the resident portal's header,
 * instead of the app's default teal from index.html: the theme colour, in light and dark view alike.
 * Follows the owner's colours and light/dark switches while mounted; puts
 * the default back on unmount.
 */
export function useStatusBarColor(header: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta || !header.current) return
    const initial = meta.content
    const apply = () => { if (header.current) meta.content = headerColour(header.current) || initial }
    apply()
    // The colours and dark mode change through attributes and inline styles on <html> and the portal's
    // own element, so any change to those re-reads the colour.
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-brand', 'data-app-bg', 'style'] })
    const shell = header.current.closest('.portal-shell')
    if (shell) observer.observe(shell, { attributes: true, attributeFilter: ['style'] })
    return () => { observer.disconnect(); meta.content = initial }
  }, [header])
}
