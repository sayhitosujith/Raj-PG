import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Keeps the spin visible long enough to register even when the data comes back instantly.
const minimumSpinMs = 600

/**
 * Manual refresh for a whole screen. Spins while `onRefresh` runs, ignores repeat clicks
 * meanwhile, and shows when the data was last updated on hover.
 */
export function RefreshButton({ onRefresh, lastUpdated, variant = 'icon', className = '' }: { onRefresh: () => Promise<void>; lastUpdated?: Date; variant?: 'icon' | 'labelled'; className?: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  // A ref, not the state above, guards re-entry: rapid clicks all fire before React re-renders,
  // so they would each still see isRefreshing === false and start their own refresh.
  const inFlight = useRef(false)
  const updatedText = lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : undefined

  async function refresh() {
    if (inFlight.current) return
    inFlight.current = true
    setIsRefreshing(true)
    await Promise.all([onRefresh().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, minimumSpinMs))])
    inFlight.current = false
    setIsRefreshing(false)
  }

  return (
    <button type="button" className={`${variant === 'icon' ? 'icon-button' : 'secondary-button'} refresh-button${isRefreshing ? ' is-refreshing' : ''} ${className}`.trim()} onClick={refresh} aria-label={isRefreshing ? 'Refreshing' : 'Refresh'} aria-busy={isRefreshing} title={updatedText ? `Refresh · ${updatedText}` : 'Refresh'}>
      <RefreshCw size={variant === 'icon' ? 18 : 14} />
      {variant === 'labelled' && <span className="button-label">{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>}
    </button>
  )
}
