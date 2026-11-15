import { LogOut } from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * Asks before signing out, so a stray tap on the sign-out button does not end the session. Shared by
 * the owner admin and the resident portal, which word it differently; tapping outside counts as "no".
 */
export function SignOutConfirm({ title, detail, confirmLabel, cancelLabel, onConfirm, onCancel }: { title: string; detail?: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <ConfirmDialog icon={<LogOut size={22} />} title={title} detail={detail} confirmLabel={confirmLabel} cancelLabel={cancelLabel} onConfirm={onConfirm} onCancel={onCancel} />
}
