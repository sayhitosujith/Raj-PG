import { LoginTestPanel } from './LoginTestPanel'

/**
 * "Performance tests" (super admins only): the resident sign-in test, run from this browser.
 *
 * Deliberately client-side: running load from the API server would measure the server while starving
 * real residents of it. One browser shares one connection, so this is a health check, not a
 * substitute for a k6 run from a separate machine.
 */
export function PerformanceTestsView({ onBack }: { onBack: () => void }) {
  return (
    <section className="workspace-view performance-tests-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Performance tests</h2><p>Check that residents can sign in and use their portal, and how fast it answers when several do at once.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>
      <LoginTestPanel />
    </section>
  )
}
