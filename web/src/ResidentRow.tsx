import { Suspense, useState, type CSSProperties } from 'react'
import { BadgeCheck, ChevronDown, CopyPlus, IndianRupee, ExternalLink, Eye, EyeOff, Pencil, ShieldX, Trash2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { daysStayedLabel, formatJoinDate } from './joinDate'
import type { AadharStatus, Resident } from './resident'
import { rentBadges, rentChip } from './rent'
import { RentPanel } from './RentPanel'
import { isAwaitingSignIn } from './residentFilters'
import { LocationLink } from './LocationLink'
import { AccessKeyReset } from './AccessKeyReset'
import { FoodRequestReview } from './FoodRequestReview'
import { formatAadhar } from './aadharNumber'
import { PhoneText } from './PhoneField'
import { LazyCountryLabel } from './CountryField'
import { hasAnyIdentity, hasCompleteIdentity, identityDocumentName, isIndian, isOnOrBeforeToday, visaTypeLabels } from './identity'
import { exitBadge, ResidentExitPanel } from './ResidentExitPanel'

/** The owner's verification decision; a rejection always carries the reason shown to the resident. */
export type AadharDecision = { decision: 'approve' } | { decision: 'reject'; reason: string }

const verificationBadges: Record<Exclude<AadharStatus, 'VERIFIED'>, { label: string; tone: string }> = {
  NOT_SUBMITTED: { label: 'not submitted', tone: 'muted' },
  PENDING: { label: 'pending review', tone: 'gold' },
  REJECTED: { label: 'rejected', tone: 'coral' },
}

const formatDateTime = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
// Expiry dates are calendar days stored at UTC midnight, so they are formatted in UTC to avoid shifting a day.
const formatDay = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** An expiry date, flagged when it has passed (the owner may need fresh documents for Form C). */
function ExpiryDate({ value }: { value: string | null | undefined }) {
  if (!value) return <>—</>
  return <>{formatDay(value)}{isOnOrBeforeToday(value) && <span className="expired-note"> · expired</span>}</>
}

/**
 * The owner's side of verification. Approve is offered once every detail of the resident's
 * document set and its upload are on file (the owner is attesting they checked them): Aadhaar for
 * Indian nationals, passport and visa for everyone else. Reject asks for a reason the resident sees.
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
    VERIFIED: `Verified${resident.aadharReviewedAt ? ` on ${formatDateTime(resident.aadharReviewedAt)}` : ''}`,
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
export function ResidentRow({ resident, index, isExpanded, onToggle, onEdit, onClone, onDelete, onVerify, onRecordRent, onUndoRent, onChanged, onNotice, securityDeposit }: { resident: Resident; index: number; isExpanded: boolean; onToggle: () => void; onEdit: () => void; onClone: () => void; onDelete: () => void; securityDeposit: number | null; onChanged: () => void; onNotice: (message: string) => void; onVerify: (decision: AadharDecision) => Promise<string | null>; onRecordRent: (month: string) => Promise<string | null>; onUndoRent: (paymentId: string) => Promise<string | null> }) {
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
  return (
    <article className={`resident-card${isExpanded ? ' is-expanded' : ''}`} style={{ '--stagger': Math.min(index, maxStaggerSteps) } as CSSProperties}>
      <div className="resident-row" onClick={toggleFromHeader}>
        <Avatar name={resident.name} photoUrl={resident.photoVersion ? `/api/residents/${resident.id}/photo?v=${resident.photoVersion}` : null} className="resident-avatar" />
        <div className="resident-info"><strong>{resident.name}{resident.aadharStatus !== 'VERIFIED' && <span className={`resident-badge ${verificationBadges[resident.aadharStatus].tone}`}>{identityDocumentName(resident.nationality)} {verificationBadges[resident.aadharStatus].label}</span>}{isAwaitingSignIn(resident) && <span className="resident-badge">Awaiting sign-in</span>}{exitBadge(resident, securityDeposit) && <span className={`resident-badge ${exitBadge(resident, securityDeposit)?.tone}`}>{exitBadge(resident, securityDeposit)?.label}</span>}{resident.active && resident.needsNewAccessKey && <span className="resident-badge coral" title="Their sign-in was cleared after an overdue-rent lockout. Edit resident → Send new login details.">Needs new access key</span>}{rentBadge && <span className={`resident-badge ${rentBadge.tone}`}>{rentBadge.label}</span>}{hasFoodRequest && <span className="resident-badge gold">Food requested</span>}</strong><small>{resident.property} · <LocationLink className="detail-location" property={resident.property} location={resident.location} /></small></div>
        <div className="resident-phone">{resident.phone && <PhoneText value={resident.phone} />}{resident.email && <a className="resident-email" href={`mailto:${resident.email}`} title={resident.email}>{resident.email}</a>}{isIndian(resident.nationality) ? resident.aadharNumber && <span className="resident-document">Aadhaar {formatAadhar(resident.aadharNumber, true)}</span> : resident.passportNumber && <span className="resident-document">Passport {resident.passportNumber}</span>}</div>
        <div className="resident-room"><div className="resident-room-meta"><span>Room</span><strong>{resident.room}</strong><small>{daysStayedLabel(resident.joinedAt)}</small></div><em className={`rent-chip ${rentChip(resident.rent).tone}`}><IndianRupee size={10} />{rentChip(resident.rent).text.replace(/^₹/, "")}</em></div>
        <span className={`status-pill ${resident.active ? 'sage' : 'gold'}`}>{resident.active ? 'Active' : 'Inactive'}</span>
        <button className="row-edit" aria-label={`Edit ${resident.name}`} title="Edit resident" onClick={onEdit}><Pencil size={14} /></button>
        <button className="row-edit row-clone" aria-label={`Clone ${resident.name}`} title="Clone: add a new resident with the same property, rent and address" onClick={onClone}><CopyPlus size={14} /></button>
        <button className="row-delete" aria-label={`Remove ${resident.name}`} title="Remove resident" onClick={onDelete}><Trash2 size={14} /></button>
        <button className="row-toggle" aria-expanded={isExpanded} aria-controls={detailsId} aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${resident.name}`} title={isExpanded ? 'Hide details' : 'Show details'} onClick={onToggle}><ChevronDown size={16} /></button>
      </div>
      {/* inert keeps collapsed links and buttons out of the tab order while they animate closed. */}
      <div className="resident-details-collapse" id={detailsId} inert={!isExpanded}>
        <div className="resident-details-inner">
          <ResidentExitPanel resident={resident} deposit={securityDeposit} onChanged={onChanged} onNotice={onNotice} />
          <AadharVerificationPanel resident={resident} onVerify={onVerify} />
          <RentPanel rent={resident.rent} onRecord={onRecordRent} onUndo={onUndoRent} />
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
                  <div><dt>Visa</dt><dd>{resident.visaNumber ? `${resident.visaNumber}${resident.visaType ? ` · ${visaTypeLabels[resident.visaType] ?? resident.visaType}` : ''}` : '—'}</dd></div>
                  <div><dt>Visa expiry</dt><dd><ExpiryDate value={resident.visaExpiry} /></dd></div>
                </>}
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
