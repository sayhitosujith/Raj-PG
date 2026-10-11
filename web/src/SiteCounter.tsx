import { useEffect, useRef, useState } from 'react'

const countMs = 1200

/**
 * A number that counts up from zero the first time it scrolls into view, with its label beneath.
 * Shows the final number straight away for people who prefer reduced motion or without IntersectionObserver.
 */
export function SiteCounter({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return }
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const start = performance.now()
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / countMs)
        setShown(Math.round(value * (1 - (1 - progress) ** 3)))
        if (progress < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }, { threshold: .4 })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value])

  return <div ref={ref} className="site-counter"><strong>{shown.toLocaleString('en-IN')}{suffix}</strong><span>{label}</span></div>
}
