import { useState } from 'react'
import { Search, UserRound, X } from 'lucide-react'
import { ModalLayer } from './ModalLayer'
import { Avatar } from './Avatar'
import { residentPhotoUrl, type Resident } from './resident'

/**
 * Chooses which resident to act as. Only current residents who can sign in are offered: moved-out
 * residents and those still awaiting approval have no portal to show.
 */
export function ResidentPicker({ residents, onPick, onClose }: { residents: Resident[]; onPick: (resident: Resident) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const words = query.trim().toLowerCase()
  const choices = residents
    .filter((resident) => resident.active && !resident.approvalPending)
    .filter((resident) => !words || `${resident.name} ${resident.property} ${resident.room}`.toLowerCase().includes(words))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="profile-modal resident-picker" role="dialog" aria-modal="true" aria-labelledby="resident-picker-title">
        <div className="modal-heading"><div><p className="eyebrow">View as</p><h2 id="resident-picker-title">Choose a resident</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <p className="resident-picker-note">You will see their portal and can act for them. Everything you do is recorded in the audit log under your name.</p>
        <label className="resident-picker-search"><Search size={15} aria-hidden="true" /><input type="search" placeholder="Search by name, property or room" aria-label="Search residents" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus /></label>
        <ul className="resident-picker-list">
          {choices.map((resident) => (
            <li key={resident.id}><button type="button" onClick={() => onPick(resident)}><Avatar name={resident.name} photoUrl={residentPhotoUrl(resident)} className="resident-picker-avatar" /><span><strong>{resident.name}</strong><small>{resident.property} · room {resident.room}</small></span></button></li>
          ))}
          {!choices.length && <li className="resident-picker-empty">{words ? 'No resident matches that search.' : 'No current residents to show.'}</li>}
        </ul>
      </div>
    </div></ModalLayer>
  )
}

/**
 * Stays on top of the resident portal while a super admin acts as a resident. Actions taken there are
 * real and made as the resident, so the banner says so and offers the only way back.
 */
export function ActingAsResidentBanner({ name, onExit }: { name: string; onExit: () => void }) {
  return (
    <div className="acting-banner" role="status">
      <UserRound size={18} aria-hidden="true" />
      <p><strong>Acting as resident {name}.</strong> Anything you do here is real, made for them, and recorded in the audit log under your name.</p>
      <button type="button" className="role-preview-exit" onClick={onExit}>Back to super admin</button>
    </div>
  )
}
