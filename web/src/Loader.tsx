import { Building2, LoaderCircle } from 'lucide-react'

/** Full-screen branded loader for start-up and sign-in checks, which would otherwise be blank. */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="page-loader" role="status" aria-live="polite">
      <div className="loader-badge" aria-hidden="true"><span className="loader-ring" /><Building2 size={26} strokeWidth={2.4} /></div>
      <p>{label}</p>
    </main>
  )
}

/** Small spinner with a label, for a section that is still fetching its data. */
export function InlineLoader({ label = 'Loading…' }: { label?: string }) {
  return <p className="portal-empty inline-loader" role="status"><LoaderCircle size={14} className="spin" aria-hidden="true" /> {label}</p>
}
