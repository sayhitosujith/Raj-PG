import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Bell, KeyRound, LogOut, X } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { daysStayedLabel, formatJoinDate } from './joinDate'
import type { AadharStatus } from './resident'
import { ResidentAadharVerification } from './ResidentAadharVerification'
import { readApiError } from './superAdmin'
import { MealTimings } from './MealTimings'
import type { MealTimes } from './meals'
import { ProfilePhotoPicker } from './ProfilePhotoPicker'
import type { RentSummary } from './rent'
import type { ResidentWorkspace } from './workspaceSettings'
import { RentBanner, RentHighlight } from './RentBanner'
import { PayRentButton } from './PayRentButton'
import { ResidentRentPayments } from './ResidentRentPayments'
import { PolicyLinks } from './PolicyLinks'
import { HouseRules } from './HouseRules'
import { NextMealAlert, WeeklyMenuButton } from './ResidentFood'
import { PortalScenery } from './PortalScenery'
import { PolicyConsentModal, type PolicyConsent } from './PolicyConsentModal'
import { ThemeToggle } from './ThemeToggle'
import { ResidentAmenities } from './PropertyFeatures'
import { ResidentHousekeeping } from './ResidentHousekeeping'
import { RefreshButton } from './RefreshButton'
import { useAutoRefresh, useRefreshSignal } from './useAutoRefresh'
import { useGreeting } from './useGreeting'
import { PageLoader } from './Loader'
import { LocationLink } from './LocationLink'
import { FoodOptIn } from './FoodOptIn'
import { displayName } from './displayName'

type ResidentProfile = { id: string; name: string; phone?: string | null; email?: string | null; aadharLast4?: string | null; permanentAddress?: string | null; createdAt: string; joinedAt: string; room: string; property: string; location: string; mustSetPassword: boolean; aadharStatus: AadharStatus; aadharRejectionReason?: string | null; aadharSubmittedAt?: string | null; photoVersion: number | null; mealTimes: MealTimes; amenities: string[]; rent: RentSummary; propertyImage: string; onlinePayment: boolean; foodOpted: boolean; foodRequestedAt: string | null; foodPlanRent: number | null; policyConsent: PolicyConsent | null; workspace: ResidentWorkspace }
async function fetchProfile() {
  const response = await fetch('/api/resident-portal/me')
  if (!response.ok) throw new Error(await readApiError(response, 'Could not load your details.'))
  return await response.json() as ResidentProfile
}

async function fetchList<T>(path: string) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path} request failed`)
  return await response.json() as T[]
}

type Announcement = { id: string; title: string; message: string; createdAt: string }

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
// Amounts are stored in paise, matching how the owner dashboard records them.

/**
 * Sets or changes the resident's password. The first password is chosen from the access-key
 * session, so `requireCurrent` is only true for later changes.
 */
function ResidentPasswordForm({ requireCurrent, submitLabel, onSaved, onCancel }: { requireCurrent: boolean; submitLabel: string; onSaved: () => void; onCancel?: () => void }) {
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get('newPassword') ?? '')
    if (newPassword !== form.get('confirmPassword')) { setError('Passwords do not match.'); return }
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/resident-portal/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword, ...(requireCurrent ? { currentPassword: form.get('currentPassword') } : {}) }) })
      if (!response.ok) { setError(await readApiError(response, 'Could not save your password.')); return }
      onSaved()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="resident-password-form" onSubmit={save}>
      {requireCurrent && <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required autoFocus /></label>}
      <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={10} required autoFocus={!requireCurrent} placeholder="At least 10 characters" /></label>
      <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <div className="modal-actions">{onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}<button type="submit" className="primary-button" disabled={isSaving}><KeyRound size={16} /> {isSaving ? 'Saving…' : submitLabel}</button></div>
    </form>
  )
}

/** Resident's own view: their details, their property's announcements, and their rent payments. */
function ResidentHome({ profile, refreshSignal, lastRefreshedAt, onRefresh, onSignOut }: { profile: ResidentProfile; refreshSignal: number; lastRefreshedAt: Date; onRefresh: () => Promise<void>; onSignOut: () => void }) {
  const { greeting, dateLabel, minutesIntoDay } = useGreeting()
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  // Hides the consent prompt as soon as acceptance succeeds, before the profile re-fetch lands.
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null)
  const pendingConsent = profile.policyConsent && profile.policyConsent.version !== acceptedVersion ? profile.policyConsent : null
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetchList<Announcement>('/api/resident-portal/announcements').then(setAnnouncements, () => setAnnouncements([]))
  }, [])
  // Background refreshes keep the last good list if a request fails.
  useRefreshSignal(refreshSignal, () => {
    fetchList<Announcement>('/api/resident-portal/announcements').then(setAnnouncements, () => undefined)
  })

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }, [])

  // Offered only when Razorpay keys are configured and something is actually owed.
  const payAction = profile.onlinePayment && profile.rent.monthlyRent && profile.rent.outstandingMonths.length ? <PayRentButton rent={profile.rent} onPaid={onRefresh} onNotice={showNotice} /> : null

  const details: Array<[string, ReactNode]> = [
    ['Property', profile.location ? <>{profile.property} · <LocationLink className="detail-location" property={profile.property} location={profile.location} /></> : profile.property],
    ['Room', profile.room],
    ['Phone', profile.phone || '—'],
    ['Email', profile.email || '—'],
    ['Aadhaar number', profile.aadharLast4 ? `XXXX XXXX ${profile.aadharLast4}` : '—'],
    ['Joining date', formatJoinDate(profile.joinedAt)],
    ['Days stayed', daysStayedLabel(profile.joinedAt)],
    ['Food plan', profile.foodOpted ? 'With food' : 'Without food'],
  ]

  return (
    <div className="portal-shell">
      <PortalScenery />
      <header className="topbar portal-topbar" inert={Boolean(pendingConsent)}>
        <div className="brand-row"><BrandMark /><span className="home-title portal-title">Resident Home</span></div>
        <div className="view-actions"><ThemeToggle className="portal-theme-toggle" /><RefreshButton variant="labelled" onRefresh={onRefresh} lastUpdated={lastRefreshedAt} /><button className="secondary-button" aria-label="Change password" onClick={() => setIsChangingPassword(true)}><KeyRound size={14} /><span className="button-label">Change password</span></button><button className="secondary-button" aria-label="Sign out" onClick={onSignOut}><LogOut size={14} /><span className="button-label">Sign out</span></button></div>
      </header>
      <main className="page-content" inert={Boolean(pendingConsent)}>
        <RentBanner rent={profile.rent} action={payAction} />
        {profile.foodOpted && <NextMealAlert refreshSignal={refreshSignal} onNotice={showNotice} />}
        <section className="welcome-row"><div><p className="eyebrow">{dateLabel}</p><h1>{greeting}, {displayName(profile.name)} <span className="wave">✦</span></h1><p className="subtitle">Room {profile.room} at {profile.property}{profile.location && <LocationLink className="portal-location" property={profile.property} location={profile.location} />}</p></div><ResidentAmenities amenities={profile.amenities} /><ProfilePhotoPicker name={profile.name} photoVersion={profile.photoVersion} onChanged={onRefresh} onNotice={showNotice} /></section>
        <section className="workspace-view">
          <div className="workspace-view-heading portal-details-heading"><div><p className="eyebrow">Resident</p><h2>My details</h2><p>Ask your property owner if anything here needs correcting.{(profile.workspace.contactPhone || profile.workspace.contactEmail) && <span className="owner-contact"> Contact {profile.workspace.businessName}:{profile.workspace.contactPhone && <> <a href={`tel:${profile.workspace.contactPhone}`}>{profile.workspace.contactPhone}</a></>}{profile.workspace.contactPhone && profile.workspace.contactEmail && ' ·'}{profile.workspace.contactEmail && <> <a href={`mailto:${profile.workspace.contactEmail}`}>{profile.workspace.contactEmail}</a></>}</span>}</p></div><div className="details-heading-actions">{profile.foodOpted && <WeeklyMenuButton refreshSignal={refreshSignal} onNotice={showNotice} />}<MealTimings times={profile.mealTimes} minutesIntoDay={minutesIntoDay} />{!profile.foodOpted && <FoodOptIn foodRequestedAt={profile.foodRequestedAt} foodPlanRent={profile.foodPlanRent} onChanged={onRefresh} onNotice={showNotice} />}</div></div>
          <RentHighlight rent={profile.rent} /><div className="portal-details-row"><img className="portal-property-photo" src={profile.propertyImage} alt={profile.property} loading="lazy" /><dl className="resident-details portal-details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div className="resident-details-wide"><dt>Permanent address</dt><dd>{profile.permanentAddress || '—'}</dd></div></dl></div>
        </section>
        <HouseRules rules={profile.workspace.houseRules} />
        <ResidentHousekeeping refreshSignal={refreshSignal} isPaused={profile.rent.state === 'LOCK_DUE'} slots={profile.workspace.slots} weeklyLimit={profile.workspace.housekeepingWeeklyLimit} onNotice={showNotice} />
        <div className="portal-grid">
          <section className="workspace-view">
            <div className="workspace-view-heading"><div><p className="eyebrow">{profile.property}</p><h2>Announcements</h2></div></div>
            {announcements === null ? <p className="portal-empty">Loading…</p> : announcements.length ? <div className="crud-list">{announcements.map((item) => <div className="crud-row" key={item.id}><div className="crud-main"><strong>{item.title}</strong><small>{item.message}</small></div><small className="portal-date">{formatDate(item.createdAt)}</small></div>)}</div> : <div className="workspace-empty"><div className="workspace-empty-icon"><Bell size={20} /></div><h3>No announcements</h3><p>Notices from your property owner will appear here.</p></div>}
          </section>
          <section className="workspace-view">
            <div className="workspace-view-heading"><div><p className="eyebrow">Rent</p><h2>My payments</h2><p>Your rent, month by month.</p></div></div>
            {payAction && <div className="pay-rent-row">{payAction}</div>}
            <ResidentRentPayments rent={profile.rent} />
          </section>
        </div>
        <PolicyLinks businessName={profile.workspace.businessName} termsAndConditions={profile.workspace.termsAndConditions} privacyPolicy={profile.workspace.privacyPolicy} />
      </main>
      {isChangingPassword && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsChangingPassword(false)}><div className="profile-modal" role="dialog" aria-labelledby="change-password-title"><div className="modal-heading"><div><p className="eyebrow">Account</p><h2 id="change-password-title">Change password</h2></div><button type="button" className="icon-button" aria-label="Close change password" onClick={() => setIsChangingPassword(false)}><X size={18} /></button></div><ResidentPasswordForm requireCurrent submitLabel="Change password" onCancel={() => setIsChangingPassword(false)} onSaved={() => { setIsChangingPassword(false); showNotice('Password changed. Your other devices were signed out.') }} /></div></div>}
      {pendingConsent && <PolicyConsentModal consent={pendingConsent} workspace={profile.workspace} onSignOut={onSignOut} onAccepted={async (version) => { if (version) setAcceptedVersion(version); await onRefresh() }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

/** Resident portal root: forces a first password after an access-key sign-in, then shows the home view. */
export function ResidentPortal({ onSignOut }: { onSignOut: () => void }) {
  const [profile, setProfile] = useState<ResidentProfile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date())

  function showLoadError(error: unknown) {
    setLoadError(error instanceof Error && error.message !== 'Failed to fetch' ? error.message : 'Could not reach the server.')
  }

  // The server decides what comes next (verification status can change on the owner's side),
  // so each step reloads the profile instead of guessing.
  function reloadProfile() {
    fetchProfile().then(setProfile, showLoadError)
  }

  useEffect(() => {
    fetchProfile().then(setProfile, showLoadError)
  }, [])
  // One refresh for the whole portal, shared by the refresh buttons and the one-minute timer. It
  // picks up the owner's Aadhaar decision without the resident pressing anything; a failed
  // attempt is ignored rather than replacing the screen with an error.
  async function refreshPortal() {
    setRefreshSignal((signal) => signal + 1)
    await fetchProfile().then(setProfile, () => undefined)
    setLastRefreshedAt(new Date())
  }

  useAutoRefresh(() => { void refreshPortal() })

  if (loadError) return <main className="login-shell"><div className="login-card"><h1>Something went wrong</h1><p className="login-error" role="alert">{loadError}</p><button className="secondary-button portal-signout" onClick={onSignOut}>Back to sign in</button></div></main>
  if (!profile) return <PageLoader label="Loading your home…" />
  if (profile.mustSetPassword) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="brand-row"><BrandMark /></div>
          <p className="eyebrow">Welcome, {displayName(profile.name)}</p>
          <h1>Choose your password</h1>
          <p className="login-hint">Your access key was for your first sign-in only. From now on, sign in with your email or phone and this password.</p>
          <ResidentPasswordForm requireCurrent={false} submitLabel="Save password" onSaved={reloadProfile} />
          <button type="button" className="text-link portal-signout" onClick={onSignOut}>Sign out</button>
        </div>
      </main>
    )
  }
  if (profile.aadharStatus !== 'VERIFIED') return <ResidentAadharVerification profile={profile} lastRefreshedAt={lastRefreshedAt} onRefresh={refreshPortal} onChanged={reloadProfile} onSignOut={onSignOut} />
  return <ResidentHome profile={profile} refreshSignal={refreshSignal} lastRefreshedAt={lastRefreshedAt} onRefresh={refreshPortal} onSignOut={onSignOut} />
}
