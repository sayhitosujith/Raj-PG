import { House, Info, IndianRupee, Wrench, type LucideIcon } from 'lucide-react'
import { Avatar } from './Avatar'
import { photoUrlFor } from './ProfilePhotoPicker'

/** The parts of the resident portal a phone shows one at a time. */
export type PortalTab = 'home' | 'services' | 'rent' | 'profile' | 'info'

// Profile shows the resident's own photo (or initials) instead of an icon.
const tabs: Array<{ key: PortalTab; label: string; icon: LucideIcon | 'avatar' }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'services', label: 'Services', icon: Wrench },
  { key: 'profile', label: 'Profile', icon: 'avatar' },
  { key: 'rent', label: 'Payments', icon: IndianRupee },
  { key: 'info', label: 'Help', icon: Info },
]

/**
 * A bottom tab bar for phones and tablets, so the long portal becomes short screens: Home (details, rent,
 * meals, announcements), Services (complaints, housekeeping), Profile (the resident's details, shown with
 * their photo; the photo in the top bar opens it too), Rent (payments) and Info (house rules, holidays, meals, app). Sections carry
 * data-panel and CSS hides the others up to 1024px (phones and tablets); on wider screens the bar is hidden and
 * everything shows as one page.
 */
export function PortalTabs({ active, onChange, name, photoVersion }: { active: PortalTab; onChange: (tab: PortalTab) => void; name: string; photoVersion: number | null }) {
  return (
    <nav className="portal-tabs" aria-label="Portal sections">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" className={active === key ? 'is-active' : undefined} aria-current={active === key ? 'page' : undefined} onClick={() => { onChange(key); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          {Icon === 'avatar' ? <span className="portal-tab-avatar-ring"><Avatar name={name} photoUrl={photoUrlFor(photoVersion)} className="portal-tab-avatar" /></span> : <Icon size={19} />}<span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
