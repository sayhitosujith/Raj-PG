import { CalendarClock } from 'lucide-react'
import { formatRupees } from './rent'
import { endsInText, formatDay, periodText, statusBadge, type MySubscription } from './subscriptions'

/** Shown on every page from 7 days before the end, so a receptionist can ask for a renewal before they are locked out. */
export function SubscriptionBanner({ subscription, onOpen }: { subscription: MySubscription | null; onOpen: () => void }) {
  const status = subscription?.status
  if (status?.state !== 'ENDING_SOON') return null
  return (
    <div className="subscription-banner" role="status">
      <CalendarClock size={18} aria-hidden="true" />
      <p><strong>Your subscription {endsInText(status.daysLeft)}.</strong> After {formatDay(status.endsOn)} you will not be able to sign in. Ask your super admin to renew it.</p>
      <button className="secondary-button" onClick={onOpen}>View subscription</button>
    </div>
  )
}

/** Receptionist page: their plan, dates and days left, and past periods. Read-only; the super admin renews it. */
export function MySubscriptionView({ subscription, onBack }: { subscription: MySubscription | null; onBack: () => void }) {
  const status = subscription?.status
  const badge = status ? statusBadge(status) : null
  const current = subscription?.current
  return (
    <section className="workspace-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Account</p><h2>Subscription</h2><p>Your access to this dashboard. Your super admin renews it; ask them before it ends.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div></div>
      {!subscription && <p className="portal-empty">Loading your subscription…</p>}
      {subscription && !current && <p className="portal-empty">No subscription has been set for you, so your access is not time-limited.</p>}
      {current && badge && (
        <div className="workspace-summary subscription-summary">
          <div><span>Plan</span><strong>{current.plan}</strong></div>
          <div><span>Started</span><strong>{formatDay(current.startsOn)}</strong></div>
          <div><span>Ends</span><strong>{formatDay(current.lastDay)}</strong></div>
          <div><span>Amount</span><strong>{formatRupees(current.amount)}</strong></div>
          <div><span>Status</span><strong><span className={`status-pill ${badge.tone}`}>{badge.label}</span></strong></div>
        </div>
      )}
      {subscription && subscription.history.length > 1 && (
        <>
          <h3 className="subscription-history-title">Earlier periods</h3>
          <ul className="subscription-history">{subscription.history.slice(1).map((row) => (
            <li key={row.id}><div><strong>{row.plan}</strong><small>{periodText(row)}</small></div><span className="subscription-amount">{formatRupees(row.amount)}</span></li>
          ))}</ul>
        </>
      )}
    </section>
  )
}

