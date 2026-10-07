/**
 * Four bouncing coloured dots, the app's one loading animation. The colours avoid green so the dots
 * look the same in the resident portal, which has none.
 */
function LoaderDots({ size = 'large' }: { size?: 'large' | 'small' }) {
  return <span className={`loader-dots is-${size}`} aria-hidden="true"><i /><i /><i /><i /></span>
}

/** Full-screen loader for start-up and sign-in checks, which would otherwise be blank. */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="page-loader" role="status" aria-live="polite">
      <LoaderDots />
      <p>{label}</p>
    </main>
  )
}

/** Small dots with a label, for a section that is still fetching its data. */
export function InlineLoader({ label = 'Loading…' }: { label?: string }) {
  return <p className="portal-empty inline-loader" role="status"><LoaderDots size="small" /> {label}</p>
}
