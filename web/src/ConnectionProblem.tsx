import { Component, type ReactNode } from 'react'
import { CloudOff } from 'lucide-react'

/**
 * Full-page "could not reach StayPilot" message with a retry button, for when the app cannot start
 * because the network failed and nothing was saved on this device. It replaces what used to happen
 * (a signed-in person dropped onto the public website, or a blank page) with something they can act on.
 */
export function ConnectionProblem({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="page-loader connection-problem" role="alert">
      <CloudOff size={34} aria-hidden="true" />
      <p><strong>Can't reach StayPilot</strong></p>
      <p>Check your internet connection and try again.</p>
      <button type="button" className="primary-button" onClick={onRetry}>Try again</button>
    </main>
  )
}

// What Chrome, Firefox and Safari say when a lazily loaded screen's script fails to download.
const chunkLoadFailure = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

/**
 * Error boundary around the lazily loaded screens. On a weak connection a screen's script can fail to
 * download, which would otherwise unmount the whole app to a blank page; this shows ConnectionProblem,
 * whose retry reloads (by then the saved app shell and any downloaded scripts make it quicker).
 * Any other error is rethrown, so real bugs are not disguised as connection problems.
 */
export class LoadErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (!chunkLoadFailure.test(error.message)) throw error
    return <ConnectionProblem onRetry={() => window.location.reload()} />
  }
}
