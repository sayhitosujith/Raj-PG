import { useState, type ReactNode } from 'react'
import { KeyRound, Settings, X } from 'lucide-react'
import { ModalLayer } from './ModalLayer'

/**
 * The gear on the resident's Profile, opening their account settings in one pop-up: notification switches,
 * fingerprint sign-in and account deletion (passed in as `children`, the same components shown on Help and Home,
 * so each setting has one implementation) plus Change password, which closes this pop-up and opens its own.
 */
export function AccountSettings({ onChangePassword, children }: { onChangePassword: () => void; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button type="button" className="icon-button portal-profile-settings" aria-label="Account settings" title="Account settings" onClick={() => setIsOpen(true)}><Settings size={18} /></button>
      {isOpen && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)}>
        <div className="profile-modal account-settings" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
          <div className="modal-heading"><div><p className="eyebrow">Account</p><h2 id="account-settings-title">Settings</h2></div><button type="button" className="icon-button" aria-label="Close settings" onClick={() => setIsOpen(false)}><X size={18} /></button></div>
          <div className="account-settings-body">
            {children}
            <button type="button" className="secondary-button account-settings-password" onClick={() => { setIsOpen(false); onChangePassword() }}><KeyRound size={14} /> Change password</button>
          </div>
        </div>
      </div></ModalLayer>}
    </>
  )
}
