import { Eye } from 'lucide-react'
import type { StaffRole } from './superAdmin'

/** The roles a super admin can view the app as: the two staff dashboards, or a resident's portal. */
export type ViewRole = StaffRole | 'RESIDENT'

const roleLabels: Record<ViewRole, string> = { SUPER_ADMIN: 'Super admin', RECEPTIONIST: 'Receptionist', RESIDENT: 'Resident' }

/**
 * Lets a super admin view the app as another role. Receptionist only changes the dashboard's layout
 * (requests still go out as the owner); Resident opens a chosen resident's real portal (ActAsResident.tsx).
 */
export function RoleSwitcher({ role, onChange }: { role: ViewRole; onChange: (role: ViewRole) => void }) {
  return (
    <div className="role-switcher" role="radiogroup" aria-label="View as">
      <span className="role-switcher-label">View as</span>
      <div className="role-switcher-options">
        {(Object.keys(roleLabels) as ViewRole[]).map((option) => (
          <button key={option} type="button" role="radio" aria-checked={role === option} className={role === option ? 'is-active' : undefined} onClick={() => onChange(option)}>{roleLabels[option]}</button>
        ))}
      </div>
    </div>
  )
}

/**
 * Always visible while a super admin previews the receptionist layout. Buttons that are still shown
 * work as normal with the owner's rights, so the banner says that plainly and gives a one-click way back.
 */
export function RolePreviewBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="role-preview-banner" role="status">
      <Eye size={18} aria-hidden="true" />
      <p><strong>Previewing as receptionist.</strong> You see their menus and pages, but the data and permissions are still yours, and changes you make are real.</p>
      <button type="button" className="role-preview-exit" onClick={onExit}>Back to super admin</button>
    </div>
  )
}
