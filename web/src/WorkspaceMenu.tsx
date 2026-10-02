import { useEffect, useRef, useState } from 'react'
import { Building2, CalendarClock, ChevronDown, Mail, Phone, QrCode } from 'lucide-react'

/** Settings sections the menu links to; each id matches a SettingsSection's anchor. */
export const settingsSectionIds = { workspace: 'settings-workspace-details', rent: 'settings-rent-rules', upi: 'settings-upi-payments' } as const

const shortcuts = [
  { id: settingsSectionIds.workspace, label: 'Workspace details & logo', icon: Building2 },
  { id: settingsSectionIds.rent, label: 'Rent rules', icon: CalendarClock },
  { id: settingsSectionIds.upi, label: 'UPI payments', icon: QrCode },
]

/**
 * The workspace box at the top of the sidebar. There is one workspace per deployment, so instead of
 * a switcher it opens a small menu: the business's contact details and shortcuts to the Settings
 * sections owners change most. Closes on a click outside or Escape.
 */
export function WorkspaceMenu({ businessName, contactPhone, contactEmail, onOpenSettings }: { businessName: string; contactPhone?: string | null; contactEmail?: string | null; onOpenSettings: (sectionId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [isOpen])

  return (
    <div className="workspace-menu" ref={rootRef}>
      <button type="button" className={`workspace-switcher${isOpen ? ' is-open' : ''}`} aria-expanded={isOpen} aria-haspopup="menu" onClick={() => setIsOpen((open) => !open)}>
        <span className="workspace-dot">{businessName.charAt(0).toUpperCase()}</span><span><strong>{businessName}</strong><small>Owner workspace</small></span><ChevronDown size={15} />
      </button>
      {isOpen && <div className="workspace-menu-panel" role="menu">
        {(contactPhone || contactEmail) && <div className="workspace-menu-contact">
          {contactPhone && <span><Phone size={12} /> {contactPhone}</span>}
          {contactEmail && <span><Mail size={12} /> {contactEmail}</span>}
        </div>}
        {shortcuts.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="menuitem" onClick={() => { setIsOpen(false); onOpenSettings(id) }}><Icon size={14} /> {label}</button>)}
      </div>}
    </div>
  )
}
