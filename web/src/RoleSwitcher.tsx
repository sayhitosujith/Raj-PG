import { Eye } from 'lucide-react'
import type { StaffRole } from './superAdmin'

const roleLabels: Record<StaffRole, string> = { SUPER_ADMIN: 'Super admin', RECEPTIONIST: 'Receptionist' }

/**
 * Lets a super admin flip the dashboard between the super admin and receptionist layouts, to check what
 * receptionists can see. Only the layout changes: requests still go out with the super admin's own
 * session, so the data and permissions stay the owner's (every property, every action).
 */
export function RoleSwitcher({ role, onChange }: { role: StaffRole; onChange: (role: StaffRole) => void }) {
  return (
    <div className="role-switcher" role="radiogroup" aria-label="View dashboard as">
      <span className="role-switcher-label">View as</span>
      <div className="role-switcher-options">
        {(Object.keys(roleLabels) as StaffRole[]).map((option) => (
          <button key={option} type="button" role="radio" aria-checked={role === option} className={role === option ? 'is-active' : undefined} onClick={() => onChange(option)}>{roleLabels[option]}</button>
        ))}
      </div>
    </div>
  )
}

/**
 * Always visible while a super admin previews another role. Buttons that are still shown work as normal
 * with the owner's rights, so the banner says that plainly and gives a one-click way back.
 */
export function RolePreviewBanner({ role, onExit }: { role: StaffRole; onExit: () => void }) {
  return (
    <div className="role-preview-banner" role="status">
      <Eye size={18} aria-hidden="true" />
      <p><strong>Previewing as {roleLabels[role].toLowerCase()}.</strong> You see their menus and pages, but the data and permissions are still yours, and changes you make are real.</p>
      <button type="button" className="outline-button" onClick={onExit}>Back to super admin</button>
    </div>
  )
}
