import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Briefcase, Building2, CalendarDays, ChevronRight, DoorOpen, Hourglass, House, IdCard, KeyRound, LogOut, Mail, PartyPopper, Phone, Siren, UtensilsCrossed, X, type LucideIcon } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { refreshBranding } from './branding'
import { daysStayedLabel, formatJoinDate, todayDateInputValue } from './joinDate'
import type { AadharStatus } from './resident'
import { ResidentIdVerification } from './ResidentIdVerification'
import { isIndian } from './identity'
import { formatAadhar } from './aadharNumber'
import { readApiError } from './superAdmin'
import { MealTimings } from './MealTimings'
import type { MealTimes } from './meals'
import { ProfilePhotoPicker, RemovePhotoButton } from './ProfilePhotoPicker'
import type { RentSummary } from './rent'
import type { ResidentWorkspace } from './workspaceSettings'
import { RentBanner, RentHighlight } from './RentBanner'
import { PayRentButton } from './PayRentButton'
import { UpiQrRentButton } from './UpiQrRentButton'
import { UpiDirectPay, type UpiClaim } from './UpiDirectPay'
import { NotificationPreferences } from './NotificationPreferences'
import { PortalAnimals } from './PortalAnimals'
import { SkyBackdrop } from './SkyBackdrop'
import { VerifiedBadge } from './VerifiedBadge'
import { LocalClock } from './LocalClock'
import { WeatherNow } from './WeatherNow'
import { previewSkyCondition, useWeather } from './weather'
import { ResidentRentPayments } from './ResidentRentPayments'
import { PortalFooter } from './PortalFooter'
import { PhoneText } from './PhoneField'
import { EmergencyContactText } from './EmergencyContact'
import { vehicleIcon, vehicleText } from './VehicleFields'
import { CallOwnerButton, EmergencyButton } from './EmergencyCall'
import { MyDetailsEditor } from './MyDetailsEditor'
import { TodayTile } from './TodayTile'
import { CalendarTile } from './CalendarTile'
import { CricketScore } from './CricketScore'
import { PortalTabs, type PortalTab } from './PortalTabs'
import { ResidentMaintenance } from './ResidentMaintenance'
import { ResidentInfo, type ResidentInfoData } from './ResidentInfo'
import { ExitPg, type ExitNotice } from './ExitPg'
import { DeleteAccountRequest } from './DeleteAccountRequest'
import { PasskeySettings } from './PasskeySettings'
import { rememberProperty } from './lastProperty'
import { useTabLayout } from './useTabLayout'
import { NotificationBell } from './NotificationBell'
import { buildResidentNotices, useRepairRequests } from './residentNotices'
import { FireAlarmOverlay, ReportFireButton, useFireAlerts } from './FireAlarm'
import { HolidayList, holidayOn, useHolidays } from './holidays'
import { HouseRules } from './HouseRules'
import { NextMealAlert, useTodayMenu, WeeklyMenuButton } from './ResidentFood'
import { PortalScenery } from './PortalScenery'
import { PolicyConsentModal, type PolicyConsent } from './PolicyConsentModal'
import { useResidentTheme } from './useResidentTheme'
import { ResidentAmenities } from './PropertyFeatures'
import { ResidentHousekeeping } from './ResidentHousekeeping'
import { RefreshButton } from './RefreshButton'
import { useAutoRefresh, useRefreshSignal } from './useAutoRefresh'
import { useGreeting } from './useGreeting'
import { PageLoader } from './Loader'
import { LocationLink } from './LocationLink'
import { FoodOptIn } from './FoodOptIn'
import { displayName } from './displayName'

type ResidentProfile = { /** The code in this resident's "Refer a friend" link. */ referralCode?: string | null; /** Pending "Delete my account" request, if any, and when the owner last declined one. */ deletionRequestedAt?: string | null; deletionDeclinedAt?: string | null; deletionDeclineReason?: string | null; id: string; name: string; info: ResidentInfoData; exit: ExitNotice; /** The property's city (Edit property), when set. */ city?: string | null; addressVerified?: boolean; phone?: string | null; ownerPhone?: string | null; email?: string | null; nationality: string; aadharNumber?: string | null; passportNumber?: string | null; permanentAddress?: string | null; emergencyContactName?: string | null; emergencyContactRelation?: string | null; emergencyContactPhone?: string | null; vehicleType?: string | null; vehicleNumber?: string | null; occupation?: string | null; createdAt: string; joinedAt: string; room: string; property: string; location: string; mustSetPassword: boolean; aadharStatus: AadharStatus; aadharRejectionReason?: string | null; aadharSubmittedAt?: string | null; photoVersion: number | null; mealTimes: MealTimes; amenities: string[]; housekeepingStaff: string[]; rent: RentSummary; propertyImage: string; onlinePayment: boolean; whatsappOptIn: boolean; emailOptIn: boolean; pendingUpiClaim: UpiClaim | null; foodOpted: boolean; foodRequestedAt: string | null; foodPlanRent: number | null; policyConsent: PolicyConsent | null; workspace: ResidentWorkspace }
// Overdue rent, an ended stay or a closed account signed the resident out; its message replaces the portal,
// even on a background refresh.
class AccessBlockedError extends Error {
  readonly code: string
  constructor(message: string, code: string) { super(message); this.code = code }
}

// Heading for each reason the server signs a resident out.
const blockedTitles: Record<string, string> = { ACCOUNT_DELETED: 'Account deleted', RENT_LOCKED: 'Access paused', STAY_ENDED: 'Access paused' }

async function fetchProfile() {
  const response = await fetch('/api/resident-portal/me')
  if (!response.ok) {
    const body = await response.clone().json().catch(() => null) as { code?: string } | null
    const message = await readApiError(response, 'Could not load your details.')
    throw body?.code && body.code in blockedTitles ? new AccessBlockedError(message, body.code) : new Error(message)
  }
  return await response.json() as ResidentProfile
}

async function fetchList<T>(path: string) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path} request failed`)
  return await response.json() as T[]
}

type Announcement = { id: string; title: string; message: string; createdAt: string }

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
function ResidentHome({ profile, refreshSignal, lastRefreshedAt, onRefresh, onSignOut, onFireRaised }: { profile: ResidentProfile; refreshSignal: number; lastRefreshedAt: Date; onRefresh: () => Promise<void>; onSignOut: () => void; onFireRaised: () => void }) {
  // Phones show one part of the portal at a time (see PortalTabs); wide screens show everything.
  const [tab, setTab] = useState<PortalTab>('home')
  useResidentTheme(profile.workspace.residentTheme)
  // Profile has no tab of its own: on phones and tablets the Home photo and "View Profile" open it;
  // on desktop, where everything is one page, "View Profile" scrolls down to it.
  const isTabLayout = useTabLayout()
  const openProfile = () => {
    if (!isTabLayout) { document.getElementById('your-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
    setTab('profile')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const { greeting, dateLabel, minutesIntoDay } = useGreeting()
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  // Hides the consent prompt as soon as acceptance succeeds, before the profile re-fetch lands.
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null)
  const pendingConsent = profile.policyConsent && profile.policyConsent.version !== acceptedVersion ? profile.policyConsent : null
  const [notice, setNotice] = useState('')
  const weather = useWeather(refreshSignal)
  // The sign-in page shows this property's photo next time on this device.
  useEffect(() => { void rememberProperty(profile.property, profile.propertyImage) }, [profile.property, profile.propertyImage])
  // The top bar's notifications: announcements, rent, the owner's decisions and repair progress.
  const repairs = useRepairRequests(refreshSignal)
  const notices = buildResidentNotices({ announcements, rent: profile.rent, exit: profile.exit, deletionDeclinedAt: profile.deletionDeclinedAt, deletionDeclineReason: profile.deletionDeclineReason, repairs })
  const holidays = useHolidays('/api/resident-portal/holidays')
  const todayMenu = useTodayMenu(refreshSignal, profile.foodOpted)
  const todayHoliday = holidayOn(holidays, todayDateInputValue())

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
  const payAction = profile.onlinePayment && profile.rent.monthlyRent && profile.rent.outstandingMonths.length ? <div className="pay-rent-actions"><PayRentButton rent={profile.rent} onPaid={onRefresh} onNotice={showNotice} /><UpiQrRentButton onPaid={onRefresh} onNotice={showNotice} /></div> : null

  // Only the ID document number and address are checked (by the owner, against the upload); phone and email are as typed.
  const isAadharVerified = profile.aadharStatus === 'VERIFIED'
  // The ID that matches nationality, in full, for the My Details card: Aadhaar for Indian nationals,
  // passport for everyone else (as in the details list below).
  const idDocumentLine = isIndian(profile.nationality)
    ? profile.aadharNumber && <span className="my-details-id"><strong className="my-details-id-label">Aadhaar Number</strong> : {formatAadhar(profile.aadharNumber, true)}</span>
    : profile.passportNumber && <span className="my-details-id"><strong className="my-details-id-label">Passport Number</strong> : {profile.passportNumber}</span>
  // Each detail with the icon its card shows (see .detail-card in App.css).
  const details: Array<[string, ReactNode, LucideIcon]> = [
    ['Property', <>{profile.property}{profile.location && <> · <LocationLink className="detail-location" property={profile.property} location={profile.location} /></>}{profile.city && <> · {profile.city}</>}</>, Building2],
    ['Room', profile.room, DoorOpen],
    ['Phone', profile.phone || '—', Phone],
    ['Email', profile.email || '—', Mail],
    ['Emergency contact', <EmergencyContactText contact={profile} />, Siren],
    ['Vehicle', vehicleText(profile), vehicleIcon(profile.vehicleType)],
    isIndian(profile.nationality)
      ? ['Aadhaar number', profile.aadharNumber ? <>{formatAadhar(profile.aadharNumber, true)}{isAadharVerified && <VerifiedBadge />}</> : '—', IdCard]
      : ['Passport number', profile.passportNumber ? <>{profile.passportNumber}{isAadharVerified && <VerifiedBadge />}</> : '—', IdCard],
    ['Joining date', formatJoinDate(profile.joinedAt), CalendarDays],
    ['Days stayed', daysStayedLabel(profile.joinedAt), Hourglass],
    ['Food plan', profile.foodOpted ? 'With food' : 'Without food', UtensilsCrossed],
    ['Occupation', profile.occupation || '—', Briefcase],
  ]

  // One detail as a card: icon, label over value, and an arrow, in the portal's card style.
  const detailCard = (label: string, value: ReactNode, Icon: LucideIcon, className = 'detail-card') => <div key={label} className={className}><span className="detail-card-icon" aria-hidden="true"><Icon size={18} /></span><dt>{label}</dt><dd>{value}</dd><ChevronRight className="detail-card-arrow" size={16} aria-hidden="true" /></div>
  // Shared by the Home card (wide screens) and the Profile tab (phones and tablets).
  const detailsList = <dl className="resident-details portal-details">{details.map(([label, value, icon]) => detailCard(label, value, icon))}{detailCard('Permanent address', <>{profile.permanentAddress || '—'}{profile.permanentAddress && isAadharVerified && profile.addressVerified !== false && <VerifiedBadge />}</>, House, 'detail-card resident-details-wide')}</dl>
  // Home card on wide screens, Profile tab on phones (CSS shows one), like the details list above.
  const exitPg = <ExitPg exit={profile.exit} amountDue={profile.rent.amountDue} deposit={profile.workspace.houseRules.securityDeposit} noticeDays={profile.exit.noticeDays} onChanged={onRefresh} onNotice={showNotice} />
  // Under the notification settings: in the Profile tab on phones, on the Home card on wide screens.
  const deleteAccount = <DeleteAccountRequest requestedAt={profile.deletionRequestedAt} declinedAt={profile.deletionDeclinedAt} declineReason={profile.deletionDeclineReason} onChanged={onRefresh} onNotice={showNotice} />
  const notifications = <><NotificationPreferences whatsappOptIn={profile.whatsappOptIn} emailOptIn={profile.emailOptIn} hasEmail={Boolean(profile.email)} onChanged={onRefresh} onNotice={showNotice} /><PasskeySettings onNotice={showNotice} /></>
  return (
    <div className="portal-shell">
      {/* Sky (with the city) first, so the trees and animals in front stand before the buildings. */}
      <SkyBackdrop condition={previewSkyCondition() ?? weather?.condition} />
      <PortalScenery />
      <PortalAnimals />
      <header className="topbar portal-topbar" inert={Boolean(pendingConsent)}>
        {/* The resident's own property photo in place of the app logo, so the portal feels like their home. */}
        <div className="brand-row"><img className="portal-property-mark" src={profile.propertyImage} alt={profile.property} title={profile.property} /><span className="home-title portal-title">Resident Home</span></div>
        <div className="view-actions"><NotificationBell ownerId={profile.id} notices={notices} /><RefreshButton variant="labelled" onRefresh={onRefresh} lastUpdated={lastRefreshedAt} /><button className="secondary-button topbar-change-password" aria-label="Change password" onClick={() => setIsChangingPassword(true)}><KeyRound size={14} /><span className="button-label">Change password</span></button><button className="secondary-button" aria-label="Sign out" onClick={onSignOut}><LogOut size={14} /><span className="button-label">Sign out</span></button></div>
      </header>
      <main className="page-content" data-tab={tab} inert={Boolean(pendingConsent)}>
        <PortalTabs active={tab} onChange={setTab} />
        <div className="portal-panel" data-panel="home">
        <RentBanner rent={profile.rent} action={payAction} />
        {profile.foodOpted && <NextMealAlert refreshSignal={refreshSignal} onNotice={showNotice} />}
        <section className="welcome-row"><div><h1>{greeting}, {displayName(profile.name)} <span className="wave">✦</span></h1></div><ResidentAmenities amenities={profile.amenities} /></section>
        <section className="workspace-view">
          <div className="workspace-view-heading portal-details-heading"><div className="portal-details-identity"><ProfilePhotoPicker name={profile.name} photoVersion={profile.photoVersion} onChanged={onRefresh} onNotice={showNotice} onOpenProfile={openProfile} /><div><div className="my-details-card"><div className="my-details-main"><div className="my-details-title"><h2>{profile.name}</h2><MyDetailsEditor details={{ name: profile.name, phone: profile.phone, email: profile.email, permanentAddress: profile.permanentAddress, emergencyContactName: profile.emergencyContactName, emergencyContactRelation: profile.emergencyContactRelation, emergencyContactPhone: profile.emergencyContactPhone, vehicleType: profile.vehicleType, vehicleNumber: profile.vehicleNumber, occupation: profile.occupation, isIndian: profile.nationality === 'IN', documentNumber: profile.nationality === 'IN' ? profile.aadharNumber : profile.passportNumber }} onChanged={onRefresh} onNotice={showNotice} /></div>{(profile.phone || profile.email || idDocumentLine) && <p className="my-details-contact">{profile.phone && <span><Phone size={14} /><PhoneText value={profile.phone} /></span>}{profile.email && <span><Mail size={14} /><a href={`mailto:${profile.email}`} title={profile.email}>{profile.email}</a></span>}{idDocumentLine && <span><IdCard size={14} />{idDocumentLine}</span>}</p>}</div><WeatherNow weather={weather} /></div><CallOwnerButton ownerName={profile.workspace.businessName} ownerPhone={profile.ownerPhone ?? profile.workspace.contactPhone} /></div><div className="portal-emergency-actions"><div className="portal-emergency-buttons"><EmergencyButton /><ReportFireButton onRaised={onFireRaised} onNotice={showNotice} /></div>{exitPg}</div></div><div className="details-heading-actions"><div className="today-grid"><CalendarTile label={dateLabel} holidays={holidays} />{todayHoliday && <TodayTile icon={<PartyPopper size={16} />} label="Holiday" value={todayHoliday} title={todayHoliday} highlight />}<LocalClock /></div><div className="meals-row">{profile.foodOpted && <WeeklyMenuButton refreshSignal={refreshSignal} onNotice={showNotice} />}<CricketScore /><MealTimings times={profile.mealTimes} minutesIntoDay={minutesIntoDay} /></div>{!profile.foodOpted && <FoodOptIn foodRequestedAt={profile.foodRequestedAt} foodPlanRent={profile.foodPlanRent} onChanged={onRefresh} onNotice={showNotice} />}</div></div>
          <RentHighlight rent={profile.rent} /><div className="portal-profile-anchor" id="your-profile"><h3>Your profile</h3><RemovePhotoButton photoVersion={profile.photoVersion} onChanged={onRefresh} onNotice={showNotice} /></div><div className="portal-details-row"><img className="portal-property-photo" src={profile.propertyImage} alt={profile.property} loading="lazy" />{detailsList}</div>
          <div className="home-notification-prefs">{notifications}{deleteAccount}</div>
        </section>
        </div>
        <div className="portal-panel" data-panel="info"><HouseRules rules={{ ...profile.workspace.houseRules, noticePeriodDays: profile.exit.noticeDays }} extra={profile.info.rules} vehicle={profile} /></div>
        <div className="portal-panel" data-panel="home"><ResidentInfo info={profile.info} onNotice={showNotice} /></div>
        <section className="workspace-view portal-panel" data-panel="home">
          <div className="workspace-view-heading"><div><p className="eyebrow">Calendar</p><h2>Upcoming holidays</h2><p>Public holidays in India. Ask your property owner about any changes to meals or housekeeping.</p></div></div>
          <HolidayList holidays={holidays} />
        </section>
        <div className="portal-panel" data-panel="services">
        <ResidentMaintenance refreshSignal={refreshSignal} onNotice={showNotice} />
        <ResidentHousekeeping holidays={holidays} refreshSignal={refreshSignal} isPaused={profile.rent.state === 'LOCK_DUE'} slots={profile.workspace.slots} weeklyLimit={profile.workspace.housekeepingWeeklyLimit} staff={profile.housekeepingStaff ?? []} onNotice={showNotice} />
        </div>
        <div className="portal-grid">
          <section className="workspace-view portal-panel" data-panel="rent">
            <div className="workspace-view-heading"><div><p className="eyebrow">Rent</p><h2>My payments</h2><p>Your rent, month by month.</p></div></div>
            {profile.workspace.upi ? <UpiDirectPay payee={profile.workspace.upi} rent={profile.rent} monthlyRent={profile.rent.monthlyRent} pendingClaim={profile.pendingUpiClaim} onReported={onRefresh} onNotice={showNotice} /> : null}
            {payAction && <div className="pay-rent-row">{payAction}</div>}
            <ResidentRentPayments rent={profile.rent} />
          </section>
        </div>
        {/* Phones and tablets only (CSS), on Home under the main card, and only for residents on the food plan;
            wide screens keep the meals row in the Home card. */}
        {profile.foodOpted && <section className="workspace-view portal-panel portal-info-meals" data-panel="home">
          <div className="workspace-view-heading"><div><p className="eyebrow">Food</p><h2>Meals</h2><p>Today's meals at {profile.property}.</p></div><WeeklyMenuButton refreshSignal={refreshSignal} onNotice={showNotice} /></div>
          <MealTimings times={profile.mealTimes} minutesIntoDay={minutesIntoDay} menu={todayMenu ?? undefined} />
        </section>}
        <section className="workspace-view portal-profile" data-panel="profile">
          <div className="portal-profile-head"><ProfilePhotoPicker name={profile.name} photoVersion={profile.photoVersion} onChanged={onRefresh} onNotice={showNotice} /><div><p className="eyebrow">Profile</p><h2>{profile.name}</h2><p>{profile.property} · Room {profile.room}</p></div><div className="portal-profile-exit">{exitPg}</div></div>
          <div className="portal-profile-actions"><MyDetailsEditor details={{ name: profile.name, phone: profile.phone, email: profile.email, permanentAddress: profile.permanentAddress, emergencyContactName: profile.emergencyContactName, emergencyContactRelation: profile.emergencyContactRelation, emergencyContactPhone: profile.emergencyContactPhone, vehicleType: profile.vehicleType, vehicleNumber: profile.vehicleNumber, occupation: profile.occupation, isIndian: profile.nationality === 'IN', documentNumber: profile.nationality === 'IN' ? profile.aadharNumber : profile.passportNumber }} onChanged={onRefresh} onNotice={showNotice} /><button type="button" className="secondary-button" onClick={() => setIsChangingPassword(true)}><KeyRound size={14} /> Change password</button></div>
          {detailsList}
          {notifications}
          {/* Phones and tablets raise the fire alarm from here; the Home card keeps the button on desktop. */}
          <section className="profile-fire">
            <div><strong>Fire emergency</strong><small>Sets off the fire alarm for everyone in your building.</small></div>
            <ReportFireButton onRaised={onFireRaised} onNotice={showNotice} />
          </section>
          {deleteAccount}
        </section>
        <PortalFooter businessName={profile.workspace.businessName} termsAndConditions={profile.workspace.termsAndConditions} privacyPolicy={profile.workspace.privacyPolicy} referralCode={profile.referralCode} onNotice={showNotice} />
      </main>
      {isChangingPassword && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsChangingPassword(false)}><div className="profile-modal" role="dialog" aria-labelledby="change-password-title"><div className="modal-heading"><div><p className="eyebrow">Account</p><h2 id="change-password-title">Change password</h2></div><button type="button" className="icon-button" aria-label="Close change password" onClick={() => setIsChangingPassword(false)}><X size={18} /></button></div><ResidentPasswordForm requireCurrent submitLabel="Change password" onCancel={() => setIsChangingPassword(false)} onSaved={() => { setIsChangingPassword(false); showNotice('Password changed. Your other devices were signed out.') }} /></div></div>}
      {pendingConsent && <PolicyConsentModal consent={pendingConsent} workspace={profile.workspace} onSignOut={onSignOut} onAccepted={async (version) => { if (version) setAcceptedVersion(version); await onRefresh() }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

/**
 * The resident portal, with the fire alarm laid over whichever screen is showing (including password
 * and ID verification), so every signed-in resident hears it.
 */
export function ResidentPortal({ onSignOut }: { onSignOut: () => void }) {
  const fire = useFireAlerts('/api/resident-portal/fire-alert')
  return <><ResidentPortalScreens onSignOut={onSignOut} onFireRaised={fire.refresh} /><FireAlarmOverlay alerts={fire.alerts} /></>
}

/** Resident portal root: forces a first password after an access-key sign-in, then shows the home view. */
function ResidentPortalScreens({ onSignOut, onFireRaised }: { onSignOut: () => void; onFireRaised: () => void }) {
  const [profile, setProfile] = useState<ResidentProfile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [blockedTitle, setBlockedTitle] = useState<string | null>(null)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date())

  function showLoadError(error: unknown) {
    setBlockedTitle(error instanceof AccessBlockedError ? blockedTitles[error.code] : null)
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
  // One refresh for the whole portal, shared by the refresh buttons and the auto-refresh timer. It
  // picks up the owner's Aadhaar decision without the resident pressing anything; a failed
  // attempt is ignored rather than replacing the screen with an error.
  async function refreshPortal() {
    setRefreshSignal((signal) => signal + 1)
    // The owner may have changed the workspace logo since this page loaded.
    refreshBranding()
    await fetchProfile().then(setProfile, (error: unknown) => { if (error instanceof AccessBlockedError) showLoadError(error) })
    setLastRefreshedAt(new Date())
  }

  useAutoRefresh(() => { void refreshPortal() })

  if (loadError) return <main className="login-shell"><div className="login-card"><h1>{blockedTitle ?? 'Something went wrong'}</h1><p className="login-error" role="alert">{loadError}</p><button className="secondary-button portal-signout" onClick={onSignOut}>Back to sign in</button></div></main>
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
  if (profile.aadharStatus !== 'VERIFIED') return <ResidentIdVerification profile={profile} lastRefreshedAt={lastRefreshedAt} onRefresh={refreshPortal} onChanged={reloadProfile} onSignOut={onSignOut} />
  return <ResidentHome profile={profile} refreshSignal={refreshSignal} lastRefreshedAt={lastRefreshedAt} onRefresh={refreshPortal} onSignOut={onSignOut} onFireRaised={onFireRaised} />
}
