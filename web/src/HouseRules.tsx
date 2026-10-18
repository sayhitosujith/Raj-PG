import { useId, useState } from 'react'
import { CalendarClock, Check, ChevronDown, MoonStar, UsersRound, WalletCards } from 'lucide-react'
import { formatRupees } from './rent'
import type { HouseRules as HouseRulesData } from './workspaceSettings'
import { vehicleIcon, vehicleText, type Vehicle } from './VehicleFields'

/**
 * House rules from Settings, shown to residents: visiting and quiet hours, notice period, deposit, the
 * resident's own registered vehicle (what security and parking go by), then the owner's own rules.
 * Starts folded to its heading so the Help tab stays short; residents open it when they need it.
 */
export function HouseRules({ rules, extra = [], vehicle }: { rules: HouseRulesData; extra?: string[]; vehicle?: Vehicle }) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const toggle = () => setIsOpen((open) => !open)
  const VehicleIcon = vehicleIcon(vehicle?.vehicleType)
  const items = [
    { icon: <UsersRound size={16} />, label: 'Visiting hours', value: rules.visitingHours },
    { icon: <MoonStar size={16} />, label: 'Quiet hours', value: rules.quietHours },
    { icon: <CalendarClock size={16} />, label: 'Notice to move out', value: rules.noticePeriodDays ? `${rules.noticePeriodDays} days` : 'Not required' },
    ...(rules.securityDeposit ? [{ icon: <WalletCards size={16} />, label: 'Security deposit', value: formatRupees(rules.securityDeposit) }] : []),
    ...(vehicle ? [{ icon: <VehicleIcon size={16} />, label: 'Your vehicle', value: vehicle.vehicleType ? vehicleText(vehicle) : 'None registered (add it under Profile)' }] : []),
  ]
  return (
    <section className={`workspace-view house-rules-card${isOpen ? ' is-open' : ''}`}>
      {/* The whole heading toggles for a pointer; the chevron is the button keyboards and screen readers use. */}
      <div className="workspace-view-heading" onClick={toggle}>
        <div><h2>House rules</h2><p>Set by your property owner.</p></div>
        <button type="button" className="collapse-toggle" aria-expanded={isOpen} aria-controls={panelId} aria-label={isOpen ? 'Hide house rules' : 'Show house rules'} title={isOpen ? 'Hide' : 'Show'} onClick={(event) => { event.stopPropagation(); toggle() }}><ChevronDown size={18} aria-hidden="true" /></button>
      </div>
      {/* inert while folded, so the hidden rules are skipped by Tab and screen readers. */}
      <div className="collapse-panel" id={panelId} inert={!isOpen}>
        <div className="collapse-panel-inner">
          <ul className="house-rules">{items.map((item) => <li key={item.label}><span className="house-rule-icon">{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></li>)}</ul>
          {extra.length > 0 && <ul className="house-rules-extra">{extra.map((rule) => <li key={rule}><Check size={14} aria-hidden="true" />{rule}</li>)}</ul>}
        </div>
      </div>
    </section>
  )
}
