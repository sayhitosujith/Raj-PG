import { House, Info, IndianRupee, UserRound, Wrench, type LucideIcon } from 'lucide-react'

/** The parts of the resident portal a phone shows one at a time. */
export type PortalTab = 'home' | 'services' | 'rent' | 'profile' | 'info'

const tabs: Array<{ key: PortalTab; label: string; icon: LucideIcon }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'services', label: 'Services', icon: Wrench },
  { key: 'rent', label: 'Rent', icon: IndianRupee },
  { key: 'profile', label: 'Profile', icon: UserRound },
  { key: 'info', label: 'Info', icon: Info },
]

/**
 * A bottom tab bar for phones, so the long portal becomes five short screens: Home (details, rent,
 * meals, announcements, holidays), Services (complaints, housekeeping), Rent (payments), Profile
 * (your details, notifications, password, sign out) and Info (house rules, app). Sections carry
 * data-panel and CSS hides the others below 720px; on wider screens the bar is hidden and
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
