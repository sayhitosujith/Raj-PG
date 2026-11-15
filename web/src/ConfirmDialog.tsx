import { useId, type ReactNode } from 'react'
import { ModalLayer } from './ModalLayer'

/**
 * The app's own "are you sure?" pop-up, in place of the browser's plain confirm box: an icon, a question, an
 * optional line of detail, and Cancel (focused, so Enter is the safe choice) beside the action. Tapping
 * outside counts as Cancel. Used for sign-out and other actions a stray tap should not trigger.
 */
export function ConfirmDialog({ icon, title, detail, confirmLabel, cancelLabel = 'Cancel', isBusy = false, onConfirm, onCancel }: { icon: ReactNode; title: string; detail?: string; confirmLabel: string; cancelLabel?: string; /** Disables both buttons while the action runs. */ isBusy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const titleId = useId()
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isBusy && onCancel()}>
      <div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="confirm-icon">{icon}</div>
        <h2 id={titleId}>{title}</h2>
        {detail && <p>{detail}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" autoFocus disabled={isBusy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="danger-button" disabled={isBusy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div></ModalLayer>
  )
}
