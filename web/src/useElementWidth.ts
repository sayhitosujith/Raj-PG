import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The element's current content width in CSS pixels. Charts draw at this width (one SVG unit = one
 * pixel) rather than scaling a fixed canvas, so their text stays 11px whether full width or half.
 */
export function useElementWidth<T extends Element>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = (contentWidth: number) => setWidth(Math.max(200, Math.round(contentWidth)))
    // Measured once now, before the first paint, so a phone never flashes the fallback width;
    // the observer then follows later resizes. The content box excludes the element's padding.
    const style = getComputedStyle(element)
    update(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
