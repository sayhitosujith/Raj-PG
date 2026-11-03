import { Suspense, useState, type CSSProperties } from 'react'
import { BadgeCheck, ChevronDown, CopyPlus, IndianRupee, ExternalLink, Eye, EyeOff, Pencil, Send, ShieldX, Trash2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { daysStayedLabel, formatJoinDate } from './joinDate'
import type { AadharStatus, Resident } from './resident'
import { rentBadges, rentChip } from './rent'
import { RentPanel } from './RentPanel'
import { isAwaitingSignIn } from './residentFilters'
import { LocationLink } from './LocationLink'
import { AccessKeyReset } from './AccessKeyReset'
import { DoorKeyManager } from './DoorAccessKey'
import { FoodRequestReview } from './FoodRequestReview'
import { formatAadhar } from './aadharNumber'
import { PhoneText } from './PhoneField'
import { readApiError } from './superAdmin'
import { EmergencyContactText } from './EmergencyContact'
import { vehicleText } from './VehicleFields'
import { CopyButton } from './CopyButton'
import { RegistrationLinkShare } from './RegistrationLinkShare'
import { linkOutcomeText, type RegistrationLinkResult } from './registrationLink'
import { LazyCountryLabel } from './CountryField'
import { hasAnyIdentity, hasCompleteIdentity, identityDocumentName, isIndian, visaText } from './identity'
import { ExpiryDate } from './ExpiryDate'
import { exitBadge, ResidentExitPanel } from './ResidentExitPanel'
import { AccountDeletionReview, deletionBadge } from './AccountDeletionReview'
import { useIsSuperAdmin } from './staffContext'
import { dietLabels } from './diet'
import { DietMark } from './DietToggle'
import { isStudent } from './occupations'

/** The owner's verification decision; a rejection always carries the reason shown to the resident. */
export type AadharDecision = { decision: 'approve' } | { decision: 'reject'; reason: string }

const verificationBadges: Record<Exclude<AadharStatus, 'VERIFIED'>, { label: string; tone: string }> = {
  NOT_SUBMITTED: { label: 'not submitted', tone: 'muted' },
  PENDING: { label: 'pending review', tone: 'gold' },
  REJECTED: { label: 'rejected', tone: 'coral' },
}

const formatDateTime = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// "Verified by Superadmin · 2 Nov 2026"; the name or date is left out when not on record.
const reviewedText = (resident: Resident) => [resident.aadharReviewedByName && `by ${resident.aadharReviewedByName}`, resident.aadharReviewedAt && formatDateTime(resident.aadharReviewedAt)].filter(Boolean).join(' · ')

/** The ID's verification status, shown under the document number in the resident list. */
function VerificationLine({ resident }: { resident: Resident }) {
  // Laid out like the document lines above it: the status in the label column, the details beside it.
  if (resident.aadharStatus !== 'VERIFIED') return <span className={`resident-document resident-verification is-${resident.aadharStatus.toLowerCase()}`}><b className="document-label">Status</b> {identityDocumentName(resident.nationality)} {verificationBadges[resident.aadharStatus].label}</span>
  return <span className="resident-document resident-verification is-verified"><b className="document-label">Verified</b> {reviewedText(resident) || '—'}</span>
}

/**
 * The staff side of verification, for super admins and receptionists alike (receptionists check IDs at the
 * desk). Approve is offered once every detail of the resident's document set and its upload are on file (the
 * reviewer is attesting they checked them): Aadhaar for Indian nationals, passport and visa for everyone else.
 * Reject asks for a reason the resident sees. Who decided is recorded and shown as "Verified by …".
 */
function AadharVerificationPanel({ resident, onVerify }: { resident: Resident; onVerify: (decision: AadharDecision) => Promise<string | null> }) {
  const [isRejecting, setIsRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const canApprove = resident.aadharStatus !== 'VERIFIED' && hasCompleteIdentity(resident)
  const isAadhar = isIndian(resident.nationality)
  const canReject = resident.aadharStatus === 'PENDING' || resident.aadharStatus === 'VERIFIED'

  async function decide(decision: AadharDecision) {
    setIsSaving(true)
    setError((await onVerify(decision)) ?? '')
    setIsSaving(false)
    setIsRejecting(false)
    setReason('')
  }

  const statusText: Record<AadharStatus, string> = {
    VERIFIED: `Verified${reviewedText(resident) ? ` ${reviewedText(resident)}` : ''}`,
    PENDING: `Submitted${resident.aadharSubmittedAt ? ` on ${formatDateTime(resident.aadharSubmittedAt)}` : ''} — check the ${isAadhar ? 'Aadhaar card' : 'passport and visa'}, then approve or reject`,
    REJECTED: `Rejected: ${resident.aadharRejectionReason ?? 'no reason given'}`,
    NOT_SUBMITTED: !hasAnyIdentity(resident) ? 'Waiting for the resident to submit' : isAadhar ? 'Incomplete — needs both the Aadhaar number and the card' : 'Incomplete — needs the passport number, expiry and scan, and the visa number, type and expiry',
  }

  return (
    <div className={`aadhar-verification is-${resident.aadharStatus.toLowerCase()}`}>
      <div className="aadhar-verification-status">{resident.aadharStatus === 'VERIFIED' ? <BadgeCheck size={16} /> : resident.aadharStatus === 'REJECTED' ? <ShieldX size={16} /> : null}<span>{statusText[resident.aadharStatus]}</span></div>
      {isRejecting
        ? <div className="aadhar-reject-form">
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder={`Reason shown to the resident, e.g. '${isAadhar ? 'Card' : 'Passport'} photo is blurry — please upload a clearer one.'`} aria-label="Reason for rejecting" autoFocus />
            <div className="aadhar-verification-actions"><button type="button" className="secondary-button" onClick={() => { setIsRejecting(false); setReason('') }}>Cancel</button><button type="button" className="danger-button" disabled={!reason.trim() || isSaving} onClick={() => decide({ decision: 'reject', reason: reason.trim() })}>Reject</button></div>
          </div>
        : (canApprove || canReject) && <div className="aadhar-verification-actions">
            {canReject && <button type="button" className="secondary-button" onClick={() => setIsRejecting(true)}>{resident.aadharStatus === 'VERIFIED' ? 'Revoke verification' : 'Reject'}</button>}
            {canApprove && <button type="button" className="primary-button" disabled={isSaving} onClick={() => decide({ decision: 'approve' })}><BadgeCheck size={15} /> Approve</button>}
          </div>}
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  )
}

// Entry animations are staggered per row but capped, so a long list never takes seconds to appear.
const maxStaggerSteps = 10

/**
 * One resident: a compact header that expands to the full details. Clicking anywhere on the
 * header toggles it; the chevron button is the keyboard- and screen-reader-accessible control.
 */
// What the waiting panel says: an invite still out, a registration to review, or a receptionist's addition.
function approvalText(resident: Resident, canDecide: boolean) {
  const registration = resident.registration
  if (registration?.status === 'INVITED') return { title: 'Registration link sent', detail: `Sent ${formatDateTime(registration.sentAt)}, works until ${formatDateTime(registration.expiresAt ?? registration.sentAt)}. Waiting for ${resident.name} to fill it in; their bed is held meanwhile.` }
  if (registration?.status === 'SUBMITTED') return { title: 'Registration submitted · review', detail: `${resident.name} filled in the link${registration.submittedAt ? ` on ${formatDateTime(registration.submittedAt)}` : ''}. Check their details and ID below, then ${canDecide ? 'approve to let them sign in with the password they chose' : 'ask a super admin to approve'}.` }
  return { title: 'Waiting for approval', detail: canDecide ? 'A receptionist added this resident. Approve to let them sign in, or reject to remove them and free the room.' : 'A super admin needs to approve this resident before they can sign in.' }
}

/**
 * A resident waiting for a super admin: added by a receptionist, or invited by registration link (sent, then
 * submitted). Super admins approve (the resident can then sign in) or reject (the resident is removed and the
 * room freed); any staff member can send a fresh link while the resident has not filled it in yet.
 */
function ResidentApprovalPanel({ resident, onChanged, onNotice }: { resident: Resident; onChanged: () => void; onNotice: (message: string) => void }) {
  const canDecide = useIsSuperAdmin()
  const [isSaving, setIsSaving] = useState(false)
  const isInvited = resident.registration?.status === 'INVITED'
  // A new link the app's WhatsApp could not send, shown for staff to send from their own WhatsApp.
  const [unsentLink, setUnsentLink] = useState<string | null>(null)
  const { title, detail } = approvalText(resident, canDecide)

  async function decide(approve: boolean) {
    if (!approve && !window.confirm(isInvited ? `Withdraw ${resident.name}'s registration link? The record is removed and their bed freed.` : `Reject ${resident.name}? They will be removed and their room freed.`)) return
    setIsSaving(true)
    const response = await fetch(`/api/residents/${resident.id}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'The decision could not be saved.') : 'Could not reach the server.'); return }
    onNotice(approve ? `${resident.name} is approved and can now sign in.` : `${resident.name} was ${isInvited ? 'withdrawn' : 'rejected'} and removed.`)
    onChanged()
  }

  async function resendLink() {
    setIsSaving(true)
    const response = await fetch(`/api/residents/${resident.id}/registration-link`, { method: 'POST' }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'The link could not be sent.') : 'Could not reach the server.'); return }
    const result = await response.json() as RegistrationLinkResult
    onNotice(linkOutcomeText(resident.name, result))
    // A link waiting to be sent by hand stays on screen; reloading the row now would lose it.
    if (result.whatsapp === 'sent') onChanged()
    else setUnsentLink(result.registrationLink)
  }

  return (
    <div className="resident-approval">
      <div><strong>{title}</strong><small>{detail}</small></div>
      {unsentLink && <RegistrationLinkShare name={resident.name} phone={resident.phone} link={unsentLink} onNotice={onNotice} />}
      <div className="aadhar-verification-actions">
        {isInvited && <button type="button" className="secondary-button" disabled={isSaving} onClick={() => void resendLink()}><Send size={14} /> Send new link</button>}
        {canDecide && <button type="button" className="secondary-button" disabled={isSaving} onClick={() => void decide(false)}>{isInvited ? 'Withdraw' : 'Reject'}</button>}
        {canDecide && !isInvited && <button type="button" className="primary-button" disabled={isSaving} onClick={() => void decide(true)}><BadgeCheck size={15} /> Approve</button>}
      </div>
    </div>
  )
}

export function ResidentRow({ resident, index, isExpanded, onToggle, onEdit, onClone, onDelete, onVerify, onRecordRent, onUndoRent, onChanged, onNotice, securityDeposit, isRecord = false, doorKeysEnabled = true }: { resident: Resident; index: number; /** Settings → Smart lock; off hides the door access key row. */ doorKeysEnabled?: boolean; isExpanded: boolean; onToggle: () => void; onEdit: () => void; onClone: () => void; onDelete: () => void; securityDeposit: number | null; /** A closed account on the Deleted records page: everything shown, nothing that would act on it as a resident. */ isRecord?: boolean; onChanged: () => void; onNotice: (message: string) => void; onVerify: (decision: AadharDecision) => Promise<string | null>; onRecordRent: (month: string) => Promise<string | null>; onUndoRent: (paymentId: string) => Promise<string | null> }) {
  // Overdue residents are locked out of the app unless the owner allowed access up to a date.
  const rentBadge = resident.rent.state !== 'LOCK_DUE' ? rentBadges[resident.rent.state]
    : resident.rentLocked ? { label: 'Rent overdue · locked out', tone: 'coral' }
    : { label: `Rent overdue · access until ${formatDateTime(resident.rentAccessUntil ?? '')}`, tone: 'gold' }
  const [isAadharRevealed, setIsAadharRevealed] = useState(false)
  const detailsId = `resident-details-${resident.id}`

  function toggleFromHeader(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    onToggle()
  }

  const hasFoodRequest = !resident.foodOpted && Boolean(resident.foodRequestedAt)
  // Cancels a rent concession (e.g. a referral reward) before its month is paid; the list reloads after.
  async function cancelConcession(concessionId: string) {
    const response = await fetch(`/api/residents/${resident.id}/concessions/${concessionId}/cancel`, { method: 'POST' }).catch(() => null)
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not cancel the discount.')
    onNotice('Discount cancelled.')
    onChanged()
    return null
  }
  return (
    <article className={`resident-card${isExpanded ? ' is-expanded' : ''}`} style={{ '--stagger': Math.min(index, maxStaggerSteps) } as CSSProperties}>
      <div className="resident-row" onClick={toggleFromHeader}>
        <Avatar name={resident.name} photoUrl={resident.photoVersion ? `/api/residents/${resident.id}/photo?v=${resident.photoVersion}` : null} className="resident-avatar" />
        <div className="resident-info"><strong>{resident.name}{resident.aadharStatus !== 'VERIFIED' && <span className={`resident-badge ${verificationBadges[resident.aadharStatus].tone}`}>{identityDocumentName(resident.nationality)} {verificationBadges[resident.aadharStatus].label}</span>}{isAwaitingSignIn(resident) && <span className="resident-badge">Awaiting sign-in</span>}{exitBadge(resident, securityDeposit) && <span className={`resident-badge ${exitBadge(resident, securityDeposit)?.tone}`}>{exitBadge(resident, securityDeposit)?.label}</span>}{deletionBadge(resident) && <span className={`resident-badge ${deletionBadge(resident)?.tone}`}>{deletionBadge(resident)?.label}</span>}{resident.active && resident.needsNewAccessKey && <span className="resident-badge coral" title="Their sign-in was cleared after an overdue-rent lockout. Edit resident → Send new login details.">Needs new access key</span>}{rentBadge && <span className={`resident-badge ${rentBadge.tone}`}>{rentBadge.label}</span>}{hasFoodRequest && <span className="resident-badge gold">Food requested</span>}</strong><small>{resident.property} · <LocationLink className="detail-location" property={resident.property} location={resident.location} /></small></div>
        <div className="resident-phone">{resident.phone && <span className="resident-contact-line"><PhoneText value={resident.phone} /><CopyButton className="contact-copy" value={resident.phone} label="Phone number" onNotice={onNotice} /></span>}{resident.email && <span className="resident-contact-line"><a className="resident-email" href={`mailto:${resident.email}`} title={resident.email}>{resident.email}</a><CopyButton className="contact-copy" value={resident.email} label="Email" onNotice={onNotice} /></span>}{isIndian(resident.nationality) ? resident.aadharNumber && <span className="resident-document"><b className="document-label is-id">Aadhaar</b> {formatAadhar(resident.aadharNumber, true)}</span> : <>{resident.passportNumber && <span className="resident-document"><b className="document-label is-id">Passport</b> {resident.passportNumber}{resident.passportExpiry && <> · expires <ExpiryDate value={resident.passportExpiry} /></>}</span>}{resident.visaNumber && <span className="resident-document"><b className="document-label is-visa">Visa</b> {visaText(resident)}{resident.visaExpiry && <> · expires <ExpiryDate value={resident.visaExpiry} /></>}</span>}</>}{hasAnyIdentity(resident) && <VerificationLine resident={resident} />}</div>
        <div className="resident-room"><div className="resident-room-meta"><span>Room</span><strong>{resident.room}{resident.bedNumber ? ` · Bed ${resident.bedNumber}` : ''}</strong><small>{daysStayedLabel(resident.joinedAt)}</small></div><em className={`rent-chip ${rentChip(resident.rent).tone}`}><IndianRupee size={10} />{rentChip(resident.rent).text.replace(/^₹/, "")}</em></div>
        {resident.approvalPending ? <span className="status-pill gold">{resident.registration?.status === 'INVITED' ? 'Link sent' : resident.registration?.status === 'SUBMITTED' ? 'Review registration' : 'Pending approval'}</span> : <span className={`status-pill ${resident.active ? 'sage' : 'gold'}`}>{resident.active ? 'Active' : 'Inactive'}</span>}
        {!isRecord && <button className="row-edit" aria-label={`Edit ${resident.name}`} title="Edit resident" onClick={onEdit}><Pencil size={14} /></button>}
        {!isRecord && <button className="row-edit row-clone" aria-label={`Clone ${resident.name}`} title="Clone: add a new resident with the same property, rent and address" onClick={onClone}><CopyPlus size={14} /></button>}
        <button className="row-delete" aria-label={`${isRecord ? 'Delete record of' : 'Remove'} ${resident.name}`} title={isRecord ? 'Delete this record permanently' : 'Remove resident'} onClick={onDelete}><Trash2 size={14} /></button>
        <button className="row-toggle" aria-expanded={isExpanded} aria-controls={detailsId} aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${resident.name}`} title={isExpanded ? 'Hide details' : 'Show details'} onClick={onToggle}><ChevronDown size={16} /></button>
      </div>
      {/* inert keeps collapsed links and buttons out of the tab order while they animate closed. */}
      <div className="resident-details-collapse" id={detailsId} inert={!isExpanded}>
        <div className="resident-details-inner">
          {!isRecord && <ResidentExitPanel resident={resident} deposit={securityDeposit} onChanged={onChanged} onNotice={onNotice} />}
          <AccountDeletionReview resident={resident} onChanged={onChanged} onNotice={onNotice} />
          {!isRecord && resident.approvalPending && <ResidentApprovalPanel resident={resident} onChanged={onChanged} onNotice={onNotice} />}
          {!isRecord && <AadharVerificationPanel resident={resident} onVerify={onVerify} />}
          <RentPanel rent={resident.rent} onRecord={onRecordRent} onUndo={onUndoRent} concessions={resident.rentConcessions} onCancelConcession={cancelConcession} />
          <dl className="resident-details">
            <div><dt>Phone</dt><dd>{resident.phone ? <a href={`tel:${resident.phone}`}><PhoneText value={resident.phone} /></a> : '—'}</dd></div>
            <div><dt>Email</dt><dd>{resident.email ? <a href={`mailto:${resident.email}`}>{resident.email}</a> : '—'}</dd></div>
            <div><dt>Nationality</dt><dd><Suspense fallback={resident.nationality}><LazyCountryLabel code={resident.nationality} /></Suspense></dd></div>
            {isIndian(resident.nationality)
              ? <>
                  <div><dt>Aadhaar number</dt><dd>{resident.aadharNumber ? <span className="aadhar-value">{formatAadhar(resident.aadharNumber, isAadharRevealed)}<button type="button" className="icon-button" aria-label={isAadharRevealed ? 'Hide Aadhaar number' : 'Show Aadhaar number'} title={isAadharRevealed ? 'Hide' : 'Show'} onClick={() => setIsAadharRevealed((revealed) => !revealed)}>{isAadharRevealed ? <EyeOff size={13} /> : <Eye size={13} />}</button></span> : '—'}</dd></div>
                  <div><dt>Aadhaar card</dt><dd>{resident.hasAadharCard ? <a href={`/api/residents/${resident.id}/aadhar-card`} target="_blank" rel="noopener noreferrer">View card <ExternalLink size={11} /></a> : 'Not uploaded'}</dd></div>
                </>
              : <>
                  <div><dt>Passport number</dt><dd>{resident.passportNumber ?? '—'}</dd></div>
                  <div><dt>Passport expiry</dt><dd><ExpiryDate value={resident.passportExpiry} /></dd></div>
                  <div><dt>Passport scan</dt><dd>{resident.hasPassportScan ? <a href={`/api/residents/${resident.id}/passport-scan`} target="_blank" rel="noopener noreferrer">View passport <ExternalLink size={11} /></a> : 'Not uploaded'}</dd></div>
                  <div><dt>Visa</dt><dd>{visaText(resident)}</dd></div>
                  <div><dt>Visa expiry</dt><dd><ExpiryDate value={resident.visaExpiry} /></dd></div>
                </>}
            {/* After the ID cells, so it fills the first row's free space on wide screens instead of a row of its own. */}
            <div><dt>Emergency contact</dt><dd><EmergencyContactText contact={resident} /></dd></div>
            <div><dt>Vehicle</dt><dd>{vehicleText(resident)}</dd></div>
            <div><dt>Occupation</dt><dd>{resident.occupation || '—'}</dd></div>
            {isStudent(resident.occupation) && <div><dt>Student ID card</dt><dd>{resident.hasStudentIdCard ? <a href={`/api/residents/${resident.id}/student-id-card`} target="_blank" rel="noopener noreferrer">View student ID <ExternalLink size={11} /></a> : 'Not uploaded'}</dd></div>}
            <div className="resident-details-wide"><dt>Permanent address</dt><dd>{resident.permanentAddress || '—'}</dd></div>
            <div><dt>Portal sign-in</dt><dd className="sign-in-cell">{resident.hasPassword ? 'Password set' : 'Not signed in yet (uses access key)'}{!isRecord && <AccessKeyReset residentId={resident.id} residentName={resident.name} hasPassword={resident.hasPassword} onReset={onChanged} onNotice={onNotice} />}</dd></div>
            {doorKeysEnabled && <div><dt>Door access key</dt><dd className="sign-in-cell">{isRecord ? (resident.doorAccessKey ?? 'Not issued') : <DoorKeyManager keyUrl={`/api/residents/${resident.id}/door-key`} holderName={resident.name} doorAccessKey={resident.doorAccessKey} revokedAt={resident.doorAccessKeyRevokedAt} onChanged={onChanged} onNotice={onNotice} />}</dd></div>}
            <div><dt>Joining date</dt><dd>{formatJoinDate(resident.joinedAt)}</dd></div>
            <div><dt>Days stayed</dt><dd>{daysStayedLabel(resident.joinedAt)}</dd></div>
            <div><dt>Food plan</dt><dd className="sign-in-cell">{!resident.foodOpted ? 'Without food' : resident.diet ? <span className="diet-inline"><DietMark diet={resident.diet} /> {dietLabels[resident.diet]}</span> : <span className="diet-inline is-unset">Diet not set</span>}{hasFoodRequest && <FoodRequestReview residentId={resident.id} residentName={resident.name} requestedAt={resident.foodRequestedAt!} rentFromProperty={resident.rentFromProperty} onChanged={onChanged} onNotice={onNotice} />}</dd></div>
          </dl>
        </div>
      </div>
    </article>
  )
}
