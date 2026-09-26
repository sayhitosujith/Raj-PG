import { CalendarClock, MoonStar, UsersRound, WalletCards } from 'lucide-react'
import { formatRupees } from './rent'
import type { HouseRules as HouseRulesData } from './workspaceSettings'

/** House rules from Settings, shown to residents: visiting and quiet hours, notice period, and deposit. */
export function HouseRules({ rules }: { rules: HouseRulesData }) {
  const items = [
    { icon: <UsersRound size={16} />, label: 'Visiting hours', value: rules.visitingHours },
    { icon: <MoonStar size={16} />, label: 'Quiet hours', value: rules.quietHours },
    { icon: <CalendarClock size={16} />, label: 'Notice to move out', value: rules.noticePeriodDays ? `${rules.noticePeriodDays} days` : 'Not required' },
    ...(rules.securityDeposit ? [{ icon: <WalletCards size={16} />, label: 'Security deposit', value: formatRupees(rules.securityDeposit) }] : []),
  ]
  return (
    <section className="workspace-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Stay</p><h2>House rules</h2><p>Set by your property owner.</p></div></div>
      <ul className="house-rules">{items.map((item) => <li key={item.label}><span className="house-rule-icon">{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></li>)}</ul>
    </section>
  )
}
