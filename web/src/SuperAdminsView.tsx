import { Suspense, useEffect, useState } from 'react'
import { KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { formatAadhar } from './aadharNumber'
import { isIndian } from './identity'
import { PhoneText } from './PhoneField'
import { readApiError, sexLabels, type SuperAdmin, isSuperAdmin, type StaffRole } from './superAdmin'
import { LazyCountryLabel } from './CountryField'
import { SuperAdminIdentityFields } from './SuperAdminIdentityFields'
import { useRefreshSignal } from './useAutoRefresh'
import { Pagination } from './Pagination'
import { usePagination } from './usePagination'
import { ModalLayer } from './ModalLayer'

// The ID number matching nationality, masked; the full number is only shown inside the edit form.
function IdentitySummary({ admin }: { admin: SuperAdmin }) {
  if (!admin.phone) return <small className="identity-missing">Identity details not added yet</small>
  return (
    <small className="identity-summary">
      <PhoneText value={admin.phone} />
      {admin.nationality && <Suspense fallback={<span>{admin.nationality}</span>}><LazyCountryLabel code={admin.nationality} /></Suspense>}
      {admin.sex && <span>{sexLabels[admin.sex]}</span>}
      {isIndian(admin.nationality)
        ? admin.aadharNumber && <span className="aadhar-value">Aadhaar {formatAadhar(admin.aadharNumber)}</span>
        : admin.passportNumber && <span className="aadhar-value">Passport •••• {admin.passportNumber.slice(-4)}</span>}
    </small>
  )
}

async function fetchSuperAdmins() {
  const response = await fetch('/api/super-admins')
  if (!response.ok) throw new Error('Super admins request failed')
  return await response.json() as SuperAdmin[]
}

/** Lists super admins and lets the signed-in admin add, edit, or delete others, and reset passwords. */
/**
 * Role for a team member, and the one property a receptionist manages (shown once Receptionist is chosen). Your own
 * role cannot be changed here, so it is shown but not sent.
 */
function StaffRoleFields({ admin, properties, isSelf }: { admin?: SuperAdmin; properties: Array<{ id?: string; name: string }>; isSelf: boolean }) {
  const [role, setRole] = useState<StaffRole>(admin?.staffRole ?? 'RECEPTIONIST')
  const choices = properties.filter((property): property is { id: string; name: string } => Boolean(property.id))
  return (
    <>
      <label>Role<select name="staffRole" value={role} disabled={isSelf} onChange={(event) => setRole(event.target.value as StaffRole)}>
        <option value="RECEPTIONIST">Receptionist: day-to-day work for their properties</option>
        <option value="SUPER_ADMIN">Super admin: everything, including settings and the team</option>
      </select></label>
      {/* One property per receptionist (the server enforces it); someone set up with several before keeps the first ticked until saved. */}
      {role === 'RECEPTIONIST' && <fieldset className="staff-properties"><legend>Property they manage</legend>
        {choices.length ? choices.map((property) => <label key={property.id} className="staff-property"><input type="radio" name="propertyIds" value={property.id} required defaultChecked={admin?.propertyIds[0] === property.id} disabled={isSelf} /> {property.name}</label>) : <p className="field-hint">Add a property first.</p>}
      </fieldset>}
    </>
  )
}

/** Form values for the team routes: every field, with the chosen property as a (one-item) list. */
const teamBody = (form: FormData) => JSON.stringify({ ...Object.fromEntries(form), propertyIds: form.getAll('propertyIds') })

export function SuperAdminsView({ currentAdminId, properties, refreshSignal, onBack, onNotice, onAdminChange }: { currentAdminId: string; properties: Array<{ id?: string; name: string }>; refreshSignal: number; onBack: () => void; onNotice: (message: string) => void; onAdminChange: (admin: SuperAdmin) => void }) {
  const [admins, setAdmins] = useState<SuperAdmin[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [resetTarget, setResetTarget] = useState<SuperAdmin | null>(null)
  const [editTarget, setEditTarget] = useState<SuperAdmin | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SuperAdmin | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const pager = usePagination(admins)

  useEffect(() => {
    fetchSuperAdmins().then(setAdmins).catch(() => onNotice('Super admins could not be loaded.'))
  }, [onNotice])
  useRefreshSignal(refreshSignal, () => { fetchSuperAdmins().then(setAdmins).catch(() => undefined) })

  function closeModals() {
    setIsAddOpen(false)
    setResetTarget(null)
    setEditTarget(null)
    setDeleteTarget(null)
    setFormError('')
  }

  async function addAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/super-admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: teamBody(form) })
    if (!response.ok) { setFormError(await readApiError(response, 'Could not add super admin.')); return }
    const admin = await response.json() as SuperAdmin
    setAdmins((current) => [...current, admin])
    closeModals()
    onNotice(`${admin.name} can now sign in as a super admin.`)
  }

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editTarget) return
    const form = new FormData(event.currentTarget)
    const response = await fetch(`/api/super-admins/${editTarget.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: teamBody(form) })
    if (!response.ok) { setFormError(await readApiError(response, 'Could not save details.')); return }
    const updated = await response.json() as SuperAdmin
    setAdmins((current) => current.map((admin) => admin.id === updated.id ? updated : admin))
    // Keeps the signed-in admin's name in the header and Settings in step with an edit of themselves.
    if (updated.id === currentAdminId) onAdminChange(updated)
    closeModals()
    onNotice(updated.id === currentAdminId ? 'Your details were saved.' : `${updated.name}'s details were saved.`)
  }

  async function deleteAdmin() {
    if (!deleteTarget) return
    setIsDeleting(true)
    const response = await fetch(`/api/super-admins/${deleteTarget.id}`, { method: 'DELETE' }).catch(() => null)
    setIsDeleting(false)
    if (!response?.ok) { setFormError(response ? await readApiError(response, 'Could not delete super admin.') : 'Could not reach the server.'); return }
    setAdmins((current) => current.filter((admin) => admin.id !== deleteTarget.id))
    closeModals()
    onNotice(`${deleteTarget.name} was removed and signed out everywhere.`)
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!resetTarget) return
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== form.get('confirmPassword')) { setFormError('Passwords do not match.'); return }
    const response = await fetch(`/api/super-admins/${resetTarget.id}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
    if (!response.ok) { setFormError(await readApiError(response, 'Could not reset password.')); return }
    const isSelf = resetTarget.id === currentAdminId
    closeModals()
    onNotice(isSelf ? 'Your password was changed. Your other devices were signed out.' : `${resetTarget.name}'s password was changed. They were signed out everywhere.`)
  }

  return (
    <section className="workspace-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Team management</h2><p>People who can sign in to this dashboard:</p><ul className="team-roles"><li><b>Super admins</b> run everything.</li><li><b>Receptionists</b> handle day-to-day work for the properties you give them.</li></ul></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button><button className="primary-button" onClick={() => setIsAddOpen(true)}><UserPlus size={16} /> Add team member</button></div></div>
      <div className="crud-list">{pager.pageItems.map((admin, index) => <div className="crud-row" key={admin.id}><span className="row-number" aria-hidden="true">{pager.from + index}</span><div className="crud-main"><strong>{admin.name}{admin.id === currentAdminId ? ' (you)' : ''}</strong><small>{admin.email} · added {new Date(admin.createdAt).toLocaleDateString()}</small><IdentitySummary admin={admin} /></div><div className="crud-actions">{isSuperAdmin(admin) ? <span className="status-pill sage"><ShieldCheck size={12} /> Super admin</span> : <span className="status-pill gold" title={properties.filter((property) => property.id && admin.propertyIds.includes(property.id)).map((property) => property.name).join(', ')}>Receptionist · {admin.propertyIds.length} {admin.propertyIds.length === 1 ? 'property' : 'properties'}</span>}<button className="secondary-button" onClick={() => setEditTarget(admin)}><Pencil size={13} /> Edit details</button><button className="secondary-button" onClick={() => setResetTarget(admin)}><KeyRound size={13} /> Reset password</button>{admin.id !== currentAdminId && <button className="row-delete" aria-label={`Delete ${admin.name}`} title="Delete super admin" onClick={() => setDeleteTarget(admin)}><Trash2 size={14} /></button>}</div></div>)}</div>
      <Pagination state={pager} label="Super admins" />
      {resetTarget && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModals()}><form className="profile-modal" onSubmit={resetPassword}><div className="modal-heading"><div><p className="eyebrow">Super admins</p><h2>Reset password</h2></div><button type="button" className="icon-button" aria-label="Close reset password" onClick={closeModals}><X size={18} /></button></div><p className="reset-password-note">{resetTarget.id === currentAdminId ? 'Choose a new password for your account. Your other devices will be signed out.' : <>Choose a new password for <strong>{resetTarget.name}</strong> ({resetTarget.email}). They will be signed out everywhere.</>}</p><label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus placeholder="At least 10 characters" /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>{formError && <p className="login-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModals}>Cancel</button><button type="submit" className="primary-button"><KeyRound size={16} /> Reset password</button></div></form></div></ModalLayer>}
      {deleteTarget && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModals()}><div className="confirm-modal" role="alertdialog" aria-labelledby="delete-admin-title"><div className="confirm-icon"><Trash2 size={22} /></div><h2 id="delete-admin-title">Delete {deleteTarget.name}?</h2><p>{deleteTarget.email} will be signed out everywhere and can no longer sign in. This cannot be undone.</p>{formError && <p className="login-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModals}>Cancel</button><button type="button" className="danger-button" disabled={isDeleting} onClick={deleteAdmin}>{isDeleting ? 'Deleting…' : 'Delete'}</button></div></div></div></ModalLayer>}
      {editTarget && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModals()}><form className="profile-modal" onSubmit={saveDetails}><div className="modal-heading"><div><p className="eyebrow">Super admins</p><h2>Edit details</h2></div><button type="button" className="icon-button" aria-label="Close edit details" onClick={closeModals}><X size={18} /></button></div><label>Full name<input name="name" required maxLength={60} defaultValue={editTarget.name} /></label>{editTarget.id === currentAdminId
  ? <label>Email address <span className="field-hint">(change your own under Settings → My account)</span><input name="email" type="email" readOnly defaultValue={editTarget.email} /></label>
  : <label>Email address <span className="field-hint">(their sign-in email)</span><input name="email" type="email" autoComplete="off" required defaultValue={editTarget.email} /></label>}<SuperAdminIdentityFields admin={editTarget} /><StaffRoleFields admin={editTarget} properties={properties} isSelf={editTarget.id === currentAdminId} />{formError && <p className="login-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModals}>Cancel</button><button type="submit" className="primary-button"><Pencil size={16} /> Save details</button></div></form></div></ModalLayer>}
      {isAddOpen && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModals()}><form className="profile-modal" onSubmit={addAdmin}><div className="modal-heading"><div><p className="eyebrow">Team</p><h2>Add team member</h2></div><button type="button" className="icon-button" aria-label="Close add team member" onClick={closeModals}><X size={18} /></button></div><label>Full name<input name="name" required /></label><label>Email address<input name="email" type="email" autoComplete="off" required /></label><SuperAdminIdentityFields /><StaffRoleFields properties={properties} isSelf={false} /><label>Temporary password<input name="password" type="password" autoComplete="new-password" minLength={10} required placeholder="At least 10 characters" /></label>{formError && <p className="login-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModals}>Cancel</button><button type="submit" className="primary-button"><UserPlus size={16} /> Add team member</button></div></form></div></ModalLayer>}
    </section>
  )
}
