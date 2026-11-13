import { House, Info, IndianRupee, Wrench, type LucideIcon } from 'lucide-react'
import { Avatar } from './Avatar'
import { photoUrlFor } from './ProfilePhotoPicker'

/** The parts of the resident portal a phone shows one at a time. */
export type PortalTab = 'home' | 'services' | 'rent' | 'profile' | 'info'

// Profile is not in the bar: the resident's photo in the top bar opens it (ProfileButton).
const tabs: Array<{ key: Exclude<PortalTab, 'profile'>; label: string; icon: LucideIcon }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'services', label: 'Services', icon: Wrench },
  { key: 'rent', label: 'Payments', icon: IndianRupee },
  { key: 'info', label: 'Help', icon: Info },
]

const openTab = (onChange: (tab: PortalTab) => void, tab: PortalTab) => { onChange(tab); window.scrollTo({ top: 0, behavior: 'smooth' }) }

/**
 * A bottom tab bar for phones and tablets, so the long portal becomes short screens: Home (details, rent,
 * meals, announcements), Services (complaints, housekeeping), Rent (payments) and Info (house rules,
 * holidays, meals, app). Profile opens from the photo in the top bar. Sections carry data-panel and CSS
 * hides the others up to 1024px (phones and tablets); on wider screens the bar is hidden and everything
 * shows as one page.
 */
export function PortalTabs({ active, onChange }: { active: PortalTab; onChange: (tab: PortalTab) => void }) {
  return (
    <nav className="portal-tabs" aria-label="Portal sections">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" className={active === key ? 'is-active' : undefined} aria-current={active === key ? 'page' : undefined} onClick={() => openTab(onChange, key)}>
          <Icon size={19} /><span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

/**
 * The resident's photo (or initials) in a colour ring at the start of the top bar, opening the Profile
 * tab. Phones and tablets only (CSS), since wider screens show the profile on the one page.
 */
export function ProfileButton({ active, onChange, name, photoVersion }: { active: PortalTab; onChange: (tab: PortalTab) => void; name: string; photoVersion: number | null }) {
  const isActive = active === 'profile'
  return (
    <button type="button" className={`portal-profile-button${isActive ? ' is-active' : ''}`} aria-label="Your profile" aria-current={isActive ? 'page' : undefined} onClick={() => openTab(onChange, 'profile')}>
      <span className="portal-avatar-ring"><Avatar name={name} photoUrl={photoUrlFor(photoVersion)} className="portal-avatar" /></span>
    </button>
  )
}
