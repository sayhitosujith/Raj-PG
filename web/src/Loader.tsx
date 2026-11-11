import { useEffect, useState } from 'react'

/**
 * Four bouncing coloured dots, the app's one loading animation. The colours avoid green so the dots
 * look the same in the resident portal, which has none.
 */
function LoaderDots({ size = 'large' }: { size?: 'large' | 'small' }) {
  return <span className={`loader-dots is-${size}`} aria-hidden="true"><i /><i /><i /><i /></span>
}

// Long enough not to appear on a normal connection; after it, the person knows the app has not hung.
const slowHintAfterMs = 8_000

/**
 * Full-screen loader for start-up and sign-in checks, which would otherwise be blank. If loading drags
 * on (2G, a weak signal) it adds a line saying the connection is slow rather than leaving the dots alone.
 */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  const [isSlow, setIsSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), slowHintAfterMs)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <main className="page-loader" role="status" aria-live="polite">
      <LoaderDots />
      <p>{label}</p>
      {isSlow && <p className="page-loader-hint">Your connection seems slow. Still loading…</p>}
    </main>
  )
}

/** Small dots with a label, for a section that is still fetching its data. */
export function InlineLoader({ label = 'Loading…' }: { label?: string }) {
  return <p className="portal-empty inline-loader" role="status"><LoaderDots size="small" /> {label}</p>
}
