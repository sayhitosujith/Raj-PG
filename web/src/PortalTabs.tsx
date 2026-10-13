import { House, Info, IndianRupee, Wrench, type LucideIcon } from 'lucide-react'

/** The parts of the resident portal a phone shows one at a time. */
export type PortalTab = 'home' | 'services' | 'rent' | 'profile' | 'info'

const tabs: Array<{ key: PortalTab; label: string; icon: LucideIcon }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'services', label: 'Services', icon: Wrench },
  { key: 'rent', label: 'Payments', icon: IndianRupee },
  { key: 'info', label: 'Info', icon: Info },
]

/**
 * A bottom tab bar for phones and tablets, so the long portal becomes short screens: Home (details, rent,
 * meals, announcements), Services (complaints, housekeeping), Rent (payments) and Info (house rules,
 * holidays, meals, app). Profile has no tab: the photo on the Home card opens it. Sections carry
 * data-panel and CSS hides the others up to 1024px (phones and tablets); on wider screens the bar is hidden and
 * everything shows as one page.
 */
export function PortalTabs({ active, onChange }: { active: PortalTab; onChange: (tab: PortalTab) => void }) {
  return (
    <nav className="portal-tabs" aria-label="Portal sections">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" className={active === key ? 'is-active' : undefined} aria-current={active === key ? 'page' : undefined} onClick={() => { onChange(key); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <Icon size={19} /><span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
