import { useState, type CSSProperties } from 'react'
import { BadgeCheck, ChevronDown, IndianRupee, ExternalLink, Eye, EyeOff, Pencil, ShieldX, Trash2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { daysStayedLabel, formatJoinDate } from './joinDate'
import type { AadharStatus, Resident } from './resident'
import { rentBadges, rentChip } from './rent'
import { RentPanel } from './RentPanel'
import { isAwaitingSignIn } from './residentFilters'
import { LocationLink } from './LocationLink'
import { AccessKeyReset } from './AccessKeyReset'
import { FoodRequestReview } from './FoodRequestReview'

/** The owner's verification decision; a rejection always carries the reason shown to the resident. */
export type AadharDecision = { decision: 'approve' } | { decision: 'reject'; reason: string }

const verificationBadges: Record<Exclude<AadharStatus, 'VERIFIED'>, { label: string; tone: string }> = {
  NOT_SUBMITTED: { label: 'Aadhaar not submitted', tone: 'muted' },
  PENDING: { label: 'Aadhaar pending review', tone: 'gold' },
  REJECTED: { label: 'Aadhaar rejected', tone: 'coral' },
}

const formatDateTime = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The owner's side of verification. Approve is offered whenever both the number and the card are
 * on file (the owner is attesting they checked the card); reject asks for a reason the resident sees.
 */
function AadharVerificationPanel({ resident, onVerify }: { resident: Resident; onVerify: (decision: AadharDecision) => Promise<string | null> }) {
  const [isRejecting, setIsRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const canApprove = resident.aadharStatus !== 'VERIFIED' && Boolean(resident.aadharNumber) && resident.hasAadharCard
  const canReject = resident.aadharStatus === 'PENDING' || resident.aadharStatus === 'VERIFIED'

  async function decide(decision: AadharDecision) {
    setIsSaving(true)
    setError((await onVerify(decision)) ?? '')
    setIsSaving(false)
    setIsRejecting(false)
    setReason('')
  }

  const statusText: Record<AadharStatus, string> = {
    VERIFIED: `Verified${resident.aadharReviewedAt ? ` on ${formatDateTime(resident.aadharReviewedAt)}` : ''}`,
    PENDING: `Submitted${resident.aadharSubmittedAt ? ` on ${formatDateTime(resident.aadharSubmittedAt)}` : ''} — check the card, then approve or reject`,
    REJECTED: `Rejected: ${resident.aadharRejectionReason ?? 'no reason given'}`,
    NOT_SUBMITTED: resident.aadharNumber || resident.hasAadharCard ? 'Incomplete — needs both the number and the card' : 'Waiting for the resident to submit',
  }

  return (
    <div className={`aadhar-verification is-${resident.aadharStatus.toLowerCase()}`}>
      <div className="aadhar-verification-status">{resident.aadharStatus === 'VERIFIED' ? <BadgeCheck size={16} /> : resident.aadharStatus === 'REJECTED' ? <ShieldX size={16} /> : null}<span>{statusText[resident.aadharStatus]}</span></div>
      {isRejecting
        ? <div className="aadhar-reject-form">
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Reason shown to the resident, e.g. 'Card photo is blurry — please upload a clearer one.'" aria-label="Reason for rejecting" autoFocus />
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

// Masked to the last four digits by default, following UIDAI guidance on displaying Aadhaar numbers.
function formatAadhar(aadharNumber: string, isRevealed: boolean) {
  const digits = aadharNumber.replace(/\D/g, '')
  const visible = isRevealed ? digits : 'X'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4)
  return visible.replace(/(.{4})(?=.)/g, '$1 ')
}

/**
 * One resident: a compact header that expands to the full details. Clicking anywhere on the
 * header toggles it; the chevron button is the keyboard- and screen-reader-accessible control.
 */
export function ResidentRow({ resident, index, isExpanded, onToggle, onEdit, onDelete, onVerify, onRecordRent, onUndoRent, onChanged, onNotice }: { resident: Resident; index: number; isExpanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onChanged: () => void; onNotice: (message: string) => void; onVerify: (decision: AadharDecision) => Promise<string | null>; onRecordRent: (month: string) => Promise<string | null>; onUndoRent: (paymentId: string) => Promise<string | null> }) {
  const rentBadge = rentBadges[resident.rent.state]
  const [isAadharRevealed, setIsAadharRevealed] = useState(false)
  const detailsId = `resident-details-${resident.id}`

  function toggleFromHeader(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    onToggle()
  }

  const hasFoodRequest = !resident.foodOpted && Boolean(resident.foodRequestedAt)
  return (
    <article className={`resident-card${isExpanded ? ' is-expanded' : ''}`} style={{ '--stagger': Math.min(index, maxStaggerSteps) } as CSSProperties}>
      <div className="resident-row" onClick={toggleFromHeader}>
        <Avatar name={resident.name} photoUrl={resident.photoVersion ? `/api/residents/${resident.id}/photo?v=${resident.photoVersion}` : null} className="resident-avatar" />
        <div className="resident-info"><strong>{resident.name}{resident.aadharStatus !== 'VERIFIED' && <span className={`resident-badge ${verificationBadges[resident.aadharStatus].tone}`}>{verificationBadges[resident.aadharStatus].label}</span>}{isAwaitingSignIn(resident) && <span className="resident-badge">Awaiting sign-in</span>}{rentBadge && <span className={`resident-badge ${rentBadge.tone}`}>{rentBadge.label}</span>}{hasFoodRequest && <span className="resident-badge gold">Food requested</span>}</strong><small>{resident.property} · <LocationLink className="detail-location" property={resident.property} location={resident.location} /></small></div>
        <div className="resident-room"><span>Room</span><strong>{resident.room}</strong><small>{daysStayedLabel(resident.joinedAt)}</small><em className={`rent-chip ${rentChip(resident.rent).tone}`}><IndianRupee size={10} />{rentChip(resident.rent).text.replace(/^₹/, "")}</em></div>
        <span className={`status-pill ${resident.active ? 'sage' : 'gold'}`}>{resident.active ? 'Active' : 'Inactive'}</span>
        <button className="row-edit" aria-label={`Edit ${resident.name}`} title="Edit resident" onClick={onEdit}><Pencil size={14} /></button>
        <button className="row-delete" aria-label={`Remove ${resident.name}`} title="Remove resident" onClick={onDelete}><Trash2 size={14} /></button>
        <button className="row-toggle" aria-expanded={isExpanded} aria-controls={detailsId} aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${resident.name}`} title={isExpanded ? 'Hide details' : 'Show details'} onClick={onToggle}><ChevronDown size={16} /></button>
      </div>
      {/* inert keeps collapsed links and buttons out of the tab order while they animate closed. */}
      <div className="resident-details-collapse" id={detailsId} inert={!isExpanded}>
        <div className="resident-details-inner">
          <AadharVerificationPanel resident={resident} onVerify={onVerify} />
          <RentPanel rent={resident.rent} onRecord={onRecordRent} onUndo={onUndoRent} />
          <dl className="resident-details">
            <div><dt>Phone</dt><dd>{resident.phone ? <a href={`tel:${resident.phone}`}>{resident.phone}</a> : '—'}</dd></div>
            <div><dt>Email</dt><dd>{resident.email ? <a href={`mailto:${resident.email}`}>{resident.email}</a> : '—'}</dd></div>
            <div><dt>Aadhaar number</dt><dd>{resident.aadharNumber ? <span className="aadhar-value">{formatAadhar(resident.aadharNumber, isAadharRevealed)}<button type="button" className="icon-button" aria-label={isAadharRevealed ? 'Hide Aadhaar number' : 'Show Aadhaar number'} title={isAadharRevealed ? 'Hide' : 'Show'} onClick={() => setIsAadharRevealed((revealed) => !revealed)}>{isAadharRevealed ? <EyeOff size={13} /> : <Eye size={13} />}</button></span> : '—'}</dd></div>
            <div><dt>Aadhaar card</dt><dd>{resident.hasAadharCard ? <a href={`/api/residents/${resident.id}/aadhar-card`} target="_blank" rel="noopener noreferrer">View card <ExternalLink size={11} /></a> : 'Not uploaded'}</dd></div>
            <div className="resident-details-wide"><dt>Permanent address</dt><dd>{resident.permanentAddress || '—'}</dd></div>
            <div><dt>Portal sign-in</dt><dd className="sign-in-cell">{resident.hasPassword ? 'Password set' : 'Not signed in yet (uses access key)'}<AccessKeyReset residentId={resident.id} residentName={resident.name} hasPassword={resident.hasPassword} onReset={onChanged} onNotice={onNotice} /></dd></div>
            <div><dt>Joining date</dt><dd>{formatJoinDate(resident.joinedAt)}</dd></div>
            <div><dt>Days stayed</dt><dd>{daysStayedLabel(resident.joinedAt)}</dd></div>
            <div><dt>Food plan</dt><dd className="sign-in-cell">{resident.foodOpted ? 'With food' : 'Without food'}{resident.rentFromProperty ? ' · rent from property prices' : ''}{hasFoodRequest && <FoodRequestReview residentId={resident.id} residentName={resident.name} requestedAt={resident.foodRequestedAt!} rentFromProperty={resident.rentFromProperty} onChanged={onChanged} onNotice={onNotice} />}</dd></div>
          </dl>
        </div>
      </div>
    </article>
  )
}
