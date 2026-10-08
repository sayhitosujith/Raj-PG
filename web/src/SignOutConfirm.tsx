import { LogOut } from 'lucide-react'
import { ModalLayer } from './ModalLayer'

/**
 * Asks before signing out, so a stray tap on the sign-out button does not end the session. Shared by
 * the owner admin and the resident portal, which word it differently; tapping outside counts as "no".
 */
export function SignOutConfirm({ title, detail, confirmLabel, cancelLabel, onConfirm, onCancel }: { title: string; detail?: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="sign-out-title">
        <div className="confirm-icon"><LogOut size={22} /></div>
        <h2 id="sign-out-title">{title}</h2>
        {detail && <p>{detail}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" autoFocus onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="danger-button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div></ModalLayer>
  )
}
