import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LazyCountryLabel } from './CountryField'
import { LaundryShopCard } from './LaundryShopCard'
import { MemberCard } from './MemberCard'
import { isStudent } from './occupations'
import { Briefcase, Building2, CalendarDays, DoorOpen, ExternalLink, Globe, Hourglass, House, IdCard, KeyRound, Mail, Phone, Plane, Power, Siren, UtensilsCrossed, X, type LucideIcon } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { refreshBranding } from './branding'
import { daysStayedLabel, formatJoinDate, todayDateInputValue } from './joinDate'
import type { AadharStatus } from './resident'
import { ResidentIdVerification } from './ResidentIdVerification'
import { isIndian, visaText } from './identity'
import { ExpiryDate } from './ExpiryDate'
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
import { GreetingWeather } from './WeatherNow'
import { previewSkyCondition, useWeather } from './weather'
import { ResidentRentPayments } from './ResidentRentPayments'
import { PortalFooter } from './PortalFooter'
import { PhoneText } from './PhoneField'
import { EmergencyContactText } from './EmergencyContact'
import { vehicleIcon, vehicleText } from './VehicleFields'
import { CallOwnerButton, EmergencyNumbers } from './EmergencyCall'
import { MyDetailsEditor } from './MyDetailsEditor'
import { ResidentDoorAccess } from './ResidentDoorAccess'
import { LateMealAction } from './LateMealAction'
import { CricketScore } from './CricketScore'
import { PortalTabs, type PortalTab } from './PortalTabs'
import { ResidentMaintenance } from './ResidentMaintenance'
import { ResidentFaqs, ResidentInfo, type ResidentInfoData } from './ResidentInfo'
import { ExitPg, type ExitNotice } from './ExitPg'
import { DeleteAccountRequest } from './DeleteAccountRequest'
import { PasskeySettings } from './PasskeySettings'
import { rememberProperty } from './lastProperty'
import { NotificationBell, type Notice, type NoticeKind } from './NotificationBell'
import { buildResidentNotices, useRepairRequests } from './residentNotices'
import { FireAlarmOverlay, ReportFireButton, useFireAlerts } from './FireAlarm'
import { HolidayList, holidayOn, useHolidays } from './holidays'
import { FestivalCelebration, FestivalGreeting } from './FestivalCelebration'
import { HouseRules } from './HouseRules'
import { MealChoiceGate, MealRatingPrompt, useTodayMenu, WeeklyMenuButton } from './ResidentFood'
import { PortalScenery } from './PortalScenery'
import { PolicyConsentModal, type PolicyConsent } from './PolicyConsentModal'
import { useResidentTheme } from './useResidentTheme'
import { useStatusBarColor } from './useStatusBarColor'
import { PropertyGallery } from './PropertyGallery'
import { FeatureBadgesProvider } from './FeatureBadges'
import { SignOutConfirm } from './SignOutConfirm'
import { portalColourStyle } from './PortalColourFields'
import { ResidentAmenities } from './PropertyFeatures'
import { ResidentHousekeeping } from './ResidentHousekeeping'
import { useAutoRefresh, useRefreshSignal } from './useAutoRefresh'
import { useGreeting } from './useGreeting'
import { PageLoader } from './Loader'
import { LocationLink } from './LocationLink'
import { FoodOptIn } from './FoodOptIn'
import { displayName } from './displayName'
import { ModalLayer } from './ModalLayer'
import { sharingLabel } from './rooms'
import { dietLabels, type Diet } from './diet'
import { DietMark } from './DietToggle'

type ResidentProfile = { /** Door lock PIN issued by a super admin, if any. */ doorAccessKey?: string | null; /** The property's locks for residents that the PIN opens; empty when none are listed. */ doorNames?: string[]; /** "PS-2026-0001": PG initials, joining year, member number; never changes. */ membershipId: string; /** Their student ID card is on file (needed while their occupation is Student). */ hasStudentIdCard?: boolean; /** The owner's last decision on a food request, for the notification. */ foodDecidedAt?: string | null; foodApproved?: boolean | null; /** When the weekly menu last changed, and what changed. */ menuUpdatedAt?: string | null; menuChanges?: string | null; /** The code in this resident's "Refer a friend" link. */ referralCode?: string | null; /** Pending "Delete my account" request, if any, and when the owner last declined one. */ deletionRequestedAt?: string | null; deletionDeclinedAt?: string | null; deletionDeclineReason?: string | null; id: string; name: string; info: ResidentInfoData; exit: ExitNotice; /** The property's city (Edit property), when set. */ city?: string | null; addressVerified?: boolean; phone?: string | null; ownerPhone?: string | null; email?: string | null; nationality: string; aadharNumber?: string | null; passportNumber?: string | null; /** Passport and Indian visa details (non-Indian residents), expiry dates as "YYYY-MM-DD…". */ passportExpiry?: string | null; visaNumber?: string | null; visaType?: string | null; visaExpiry?: string | null; permanentAddress?: string | null; emergencyContactName?: string | null; emergencyContactRelation?: string | null; emergencyContactPhone?: string | null; vehicleType?: string | null; vehicleNumber?: string | null; occupation?: string | null; createdAt: string; joinedAt: string; room: string; /** Beds in the room: 1 is single, 2 is two sharing… Absent from a backend older than this field. */ roomBeds?: number; /** Their bed in the room (1, 2, …); null until staff assign one. */ bedNumber?: number | null; property: string; location: string; mustSetPassword: boolean; aadharStatus: AadharStatus; aadharRejectionReason?: string | null; aadharSubmittedAt?: string | null; photoVersion: number | null; mealTimes: MealTimes; amenities: string[]; housekeepingStaff: string[]; rent: RentSummary; propertyImage: string; onlinePayment: boolean; whatsappOptIn: boolean; emailOptIn: boolean; pendingUpiClaim: UpiClaim | null; foodOpted: boolean; /** Veg or non-veg, as the owner set it; null is Not set. */ diet?: Diet | null; foodRequestedAt: string | null; foodPlanRent: number | null; policyConsent: PolicyConsent | null; workspace: ResidentWorkspace }
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

// Where each kind of notification leads; kinds the portal has no section for (team, subscription…) only mark read.
const noticeTargets: Partial<Record<NoticeKind, { tab: PortalTab; sections: string[] }>> = {
  Rent: { tab: 'rent', sections: ['#portal-payments'] },
  Reward: { tab: 'rent', sections: ['#portal-payments'] },
  'Move-out': { tab: 'services', sections: ['.portal-services-exit', '.portal-details-heading'] },
  Repair: { tab: 'services', sections: ['#portal-repairs'] },
  Food: { tab: 'home', sections: ['.portal-info-meals', '.portal-details-heading'] },
  Account: { tab: 'home', sections: ['.home-notification-prefs'] },
}

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
function ResidentHome({ profile, refreshSignal, onRefresh, onSignOut, onFireRaised }: { profile: ResidentProfile; refreshSignal: number; onRefresh: () => Promise<void>; onSignOut: () => void; onFireRaised: () => void }) {
  // Phones show one part of the portal at a time (see PortalTabs); wide screens show everything.
  const [tab, setTab] = useState<PortalTab>('home')
  const [openAnnouncement, setOpenAnnouncement] = useState<Announcement | null>(null)
  useResidentTheme(profile.workspace.residentTheme)
  // The phone's status bar takes the header's theme colour while the portal is open.
  const topbar = useRef<HTMLElement>(null)
  useStatusBarColor(topbar)
  const { greeting, minutesIntoDay } = useGreeting()
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false)
  // Hides the consent prompt as soon as acceptance succeeds, before the profile re-fetch lands.
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null)
  const pendingConsent = profile.policyConsent && profile.policyConsent.version !== acceptedVersion ? profile.policyConsent : null
  const [notice, setNotice] = useState('')
  const { weather, locate, isLocating, hasChecked: hasCheckedWeather } = useWeather(refreshSignal)
  // The sign-in page shows this property's photo next time on this device.
  useEffect(() => { void rememberProperty(profile.property, profile.propertyImage) }, [profile.property, profile.propertyImage])
  // The top bar's notifications: announcements, rent, the owner's decisions and repair progress.
  const repairs = useRepairRequests(refreshSignal)
  const notices = buildResidentNotices({ announcements, rent: profile.rent, exit: profile.exit, deletionDeclinedAt: profile.deletionDeclinedAt, deletionDeclineReason: profile.deletionDeclineReason, foodDecidedAt: profile.foodDecidedAt, foodApproved: profile.foodApproved, menuUpdatedAt: profile.menuUpdatedAt, menuChanges: profile.menuChanges, repairs })
  const holidays = useHolidays('/api/resident-portal/holidays')
  // Today's public holiday, if any: the portal celebrates it over the sky and under the greeting.
  const festival = holidayOn(holidays, todayDateInputValue())
  const todayMenu = useTodayMenu(refreshSignal, profile.foodOpted)

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
  // Occupation and diet as tags under the cardholder on the Home member card.
  const identityTags = (profile.occupation?.trim() || profile.foodOpted) && <div className="portal-details-tags">{profile.occupation?.trim() && <span className="portal-details-room"><Briefcase size={13} aria-hidden="true" /><span>{profile.occupation.trim()}</span></span>}{profile.foodOpted && (profile.diet ? <span className={`welcome-diet is-${profile.diet === 'VEG' ? 'veg' : 'non-veg'}`}><DietMark diet={profile.diet} /> {dietLabels[profile.diet]}</span> : <span className="welcome-diet is-unset">Diet not set</span>)}</div>
  // Each detail with the icon its card shows (see .detail-card in App.css).
  const details: Array<[string, ReactNode, LucideIcon]> = [
    ['Property', <>{profile.property}{profile.location && <> · <LocationLink className="detail-location" property={profile.property} location={profile.location} /></>}{profile.city && <> · {profile.city}</>}</>, Building2],
    ['Room', profile.room, DoorOpen],
    ['Phone', profile.phone ? <PhoneText value={profile.phone} /> : '—', Phone],
    ['Email', profile.email || '—', Mail],
    ['Nationality', profile.nationality ? <Suspense fallback={profile.nationality}><LazyCountryLabel code={profile.nationality} /></Suspense> : '—', Globe],
    ['Emergency contact', <EmergencyContactText contact={profile} />, Siren],
    ['Vehicle', vehicleText(profile), vehicleIcon(profile.vehicleType)],
    isIndian(profile.nationality)
      ? ['Aadhaar number', profile.aadharNumber ? <>{formatAadhar(profile.aadharNumber)}{isAadharVerified && <VerifiedBadge />}</> : '—', IdCard]
      : ['Passport number', profile.passportNumber ? <>{profile.passportNumber} · expires <ExpiryDate value={profile.passportExpiry} />{isAadharVerified && <VerifiedBadge />}</> : '—', IdCard],
    ...(isIndian(profile.nationality) ? [] : [['Visa', profile.visaNumber ? <>{visaText(profile)} · expires <ExpiryDate value={profile.visaExpiry} /></> : '—', Plane] as [string, ReactNode, LucideIcon]]),
    ['Joining date', formatJoinDate(profile.joinedAt), CalendarDays],
    ['Days stayed', daysStayedLabel(profile.joinedAt), Hourglass],
    ['Food plan', profile.foodOpted ? 'With food' : 'Without food', UtensilsCrossed],
    // A student can open the ID card on file from here; without one, they are told it is missing.
    ['Occupation', isStudent(profile.occupation) ? <>{profile.occupation} · {profile.hasStudentIdCard ? <a className="detail-card-link" href="/api/resident-portal/student-id-card" target="_blank" rel="noopener noreferrer">View ID card <ExternalLink size={12} aria-hidden="true" /></a> : 'ID card not uploaded'}</> : profile.occupation || '—', Briefcase],
  ]

  // One detail as a card: icon, label over value, and an arrow, in the portal's card style.
  const detailCard = (label: string, value: ReactNode, Icon: LucideIcon, className = 'detail-card') => <div key={label} className={className}><span className="detail-card-icon" aria-hidden="true"><Icon size={18} /></span><dt>{label}</dt><dd>{value}</dd></div>
  // Shared by the Home card (wide screens) and the Profile tab (phones and tablets).
  const detailsList = <dl className="resident-details portal-details">{details.map(([label, value, icon]) => detailCard(label, value, icon))}{detailCard('Permanent address', <>{profile.permanentAddress || '—'}{profile.permanentAddress && isAadharVerified && profile.addressVerified !== false && <VerifiedBadge />}</>, House, 'detail-card resident-details-wide')}</dl>
  // Home card on wide screens, Profile tab on phones (CSS shows one), like the details list above.
  // The receptionist's number (the property's manager number, else the workspace's), for the call button in Property info.
  const managerPhone = profile.ownerPhone ?? profile.workspace.contactPhone
  // A clicked notification goes to what it is about: an announcement opens in full (it has no section of its
  // own); the rest switch to their tab and scroll to their section. Phones show one tab while wide screens show
  // everything, so each lists the sections it could be in, and the first one showing is used.
  function openNotice(clicked: Notice) {
    if (clicked.kind === 'Announcement') { setOpenAnnouncement(announcements?.find((item) => clicked.id === `announcement-${item.id}`) ?? null); return }
    const target = noticeTargets[clicked.kind]
    if (!target) return
    setTab(target.tab)
    requestAnimationFrame(() => {
      const section = target.sections.map((selector) => document.querySelector<HTMLElement>(selector)).find((element) => element?.offsetParent)
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }
  const exitPg = <ExitPg exit={profile.exit} amountDue={profile.rent.amountDue} deposit={profile.workspace.houseRules.securityDeposit} noticeDays={profile.exit.noticeDays} onChanged={onRefresh} onNotice={showNotice} />
  // Under the notification settings: in the Profile tab on phones, on the Home card on wide screens.
  const deleteAccount = <DeleteAccountRequest requestedAt={profile.deletionRequestedAt} declinedAt={profile.deletionDeclinedAt} declineReason={profile.deletionDeclineReason} onChanged={onRefresh} onNotice={showNotice} />
  const notifications = <><NotificationPreferences whatsappOptIn={profile.whatsappOptIn} emailOptIn={profile.emailOptIn} hasEmail={Boolean(profile.email)} onChanged={onRefresh} onNotice={showNotice} /><PasskeySettings onNotice={showNotice} /></>
  return (
    <FeatureBadgesProvider value={profile.workspace.featureBadges ?? {}}>
    <div className="portal-shell" style={portalColourStyle({ theme: profile.workspace.portalThemeColor, text: profile.workspace.portalButtonTextColor, error: profile.workspace.portalErrorColor, ink: profile.workspace.portalTextColor, placeholder: profile.workspace.portalPlaceholderColor, newBadge: profile.workspace.portalNewBadgeColor, soonBadge: profile.workspace.portalSoonBadgeColor, betaBadge: profile.workspace.portalBetaBadgeColor, background: profile.workspace.portalBackgroundColor, card: profile.workspace.portalCardColor, childCard: profile.workspace.portalChildCardColor })} data-card-bg={profile.workspace.portalCardColor ? "" : undefined} data-child-card-bg={profile.workspace.portalChildCardColor ? "" : undefined}>
      {/* Sky (with the city) first, so the trees and animals in front stand before the buildings. */}
      <SkyBackdrop condition={previewSkyCondition() ?? weather?.condition} />
      {festival && <FestivalCelebration />}
      <PortalScenery />
      <PortalAnimals />
      <header ref={topbar} className="topbar portal-topbar" inert={Boolean(pendingConsent)}>
        {/* The greeting heads every tab ("Good evening, Sujith"), beside the bell and sign-out. */}
        <h1 className="portal-greeting">{greeting.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())}, {displayName(profile.name)} <span className="wave">✦</span></h1>
        <div className="view-actions"><NotificationBell ownerId={profile.id} notices={notices} onOpen={openNotice} /><button className="secondary-button topbar-change-password" aria-label="Change password" onClick={() => setIsChangingPassword(true)}><KeyRound size={14} /><span className="button-label">Change password</span></button><button type="button" className="portal-power-button" aria-label="Sign out" title="Sign out" onClick={() => setIsConfirmingSignOut(true)}><Power size={16} /></button></div>
      </header>
      <main className="page-content" data-tab={tab} inert={Boolean(pendingConsent)}>
        <PortalTabs active={tab} onChange={setTab} name={profile.name} photoVersion={profile.photoVersion} />
        <div className="portal-panel" data-panel="home">
        <RentBanner rent={profile.rent} action={payAction} />
        {profile.foodOpted && <MealChoiceGate refreshSignal={refreshSignal} onNotice={showNotice} />}
        {profile.foodOpted && <MealRatingPrompt refreshSignal={refreshSignal} onNotice={showNotice} />}
        <section className="welcome-row"><div className="welcome-intro">{festival && <FestivalGreeting festival={festival} />}<ResidentAmenities amenities={profile.amenities} /></div><GreetingWeather weather={weather} isLocating={isLocating} hasChecked={hasCheckedWeather} onLocate={locate} onNotice={showNotice} /></section>
        <section className="workspace-view">
          <div className="workspace-view-heading portal-details-heading"><div className="portal-details-identity"><div className="portal-details-body"><MemberCard property={profile.property} membershipId={profile.membershipId} name={displayName(profile.name)} room={profile.room} bed={profile.bedNumber} roomBeds={profile.roomBeds} rent={profile.rent} tags={identityTags} /></div><div className="portal-emergency-actions"><div className="portal-emergency-buttons"><ReportFireButton onRaised={onFireRaised} onNotice={showNotice} /></div>{exitPg}</div></div><div className="details-heading-actions"><div className="meals-row">{profile.foodOpted && <WeeklyMenuButton refreshSignal={refreshSignal} onNotice={showNotice} />}<CricketScore />{profile.foodOpted && <MealTimings times={profile.mealTimes} minutesIntoDay={minutesIntoDay} />}</div>{!profile.foodOpted && <FoodOptIn foodRequestedAt={profile.foodRequestedAt} foodPlanRent={profile.foodPlanRent} onChanged={onRefresh} onNotice={showNotice} />}</div></div>
          <RentHighlight rent={profile.rent} room={`Room ${profile.room}${profile.roomBeds ? ` · ${sharingLabel(profile.roomBeds)}` : ''}`} /><div className="portal-profile-anchor" id="your-profile"><h3>Your profile</h3><RemovePhotoButton photoVersion={profile.photoVersion} onChanged={onRefresh} onNotice={showNotice} /></div><div className="portal-details-row"><img className="portal-property-photo" src={profile.propertyImage} alt={profile.property} loading="lazy" />{detailsList}</div>
          <div className="home-notification-prefs">{notifications}{deleteAccount}</div>
        </section>
        </div>
        <div className="portal-panel" data-panel="info"><section className="help-emergency"><div><strong>Emergency support</strong><small>Get immediate help 24/7</small></div><EmergencyNumbers /></section><HouseRules rules={{ ...profile.workspace.houseRules, noticePeriodDays: profile.exit.noticeDays }} extra={profile.info.rules} vehicle={profile} />{profile.workspace.laundryShop && <LaundryShopCard shop={profile.workspace.laundryShop} />}<ResidentFaqs faqs={profile.info.faqs} />{/* Phones and tablets only (CSS): wide screens keep these in the Home card. */}<div className="portal-info-settings">{notifications}{deleteAccount}</div></div>
        <div className="portal-panel" data-panel="home"><ResidentInfo info={profile.info} onNotice={showNotice} action={managerPhone ? <CallOwnerButton ownerName={profile.workspace.businessName} ownerPhone={managerPhone} /> : undefined} /></div>
        <ResidentDoorAccess enabled={profile.workspace.doorKeysEnabled !== false} doorAccessKey={profile.doorAccessKey} doorNames={profile.doorNames ?? []} isRentOverdue={profile.rent.state === 'LOCK_DUE'} location={profile.workspace.lockLocation} instructions={profile.workspace.doorUnlockInstructions} onNotice={showNotice} />
        <PropertyGallery refreshSignal={refreshSignal} />
        <section className="workspace-view portal-panel" data-panel="home">
          <div className="workspace-view-heading"><div><h2>Upcoming holidays</h2><p>Public holidays in India. Ask your property owner about any changes to meals or housekeeping.</p></div></div>
          <HolidayList holidays={holidays} />
        </section>
        <div className="portal-panel" data-panel="services">
        {/* Phones and tablets only (CSS): wide screens keep Exit PG in the Home card. */}
        <section className="workspace-view portal-tab-services portal-services-exit">
          <div className="workspace-view-heading"><div><p className="eyebrow">Service</p><h2>Exit PG</h2><p>Moving out? Give at least {profile.exit.noticeDays} days' notice and follow your request here.</p></div></div>
          {exitPg}
        </section>
        <ResidentMaintenance refreshSignal={refreshSignal} onNotice={showNotice} />
        <ResidentHousekeeping holidays={holidays} refreshSignal={refreshSignal} isPaused={profile.rent.state === 'LOCK_DUE'} slots={profile.workspace.slots} weeklyLimit={profile.workspace.housekeepingWeeklyLimit} staff={profile.housekeepingStaff ?? []} onNotice={showNotice} />
        </div>
        <div className="portal-grid">
          <section id="portal-payments" className="workspace-view portal-panel" data-panel="rent">
            <div className="workspace-view-heading"><div><p className="eyebrow">Rent</p><h2>My payments</h2><p>Your rent, month by month.</p></div></div>
            {profile.workspace.upi ? <UpiDirectPay payee={profile.workspace.upi} rent={profile.rent} monthlyRent={profile.rent.monthlyRent} pendingClaim={profile.pendingUpiClaim} onReported={onRefresh} onNotice={showNotice} /> : null}
            {payAction && <div className="pay-rent-row">{payAction}</div>}
            <ResidentRentPayments rent={profile.rent} pendingClaim={profile.pendingUpiClaim} />
          </section>
        </div>
        {/* Phones and tablets only (CSS), on Home under the main card, and only for residents on the food plan;
            wide screens keep the meals row in the Home card. */}
        {profile.foodOpted && <section className="workspace-view portal-panel portal-info-meals" data-panel="home">
          <div className="workspace-view-heading"><div><h2>Meals</h2><p>Today's meals at {profile.property}.</p></div><WeeklyMenuButton refreshSignal={refreshSignal} onNotice={showNotice} /></div>
          <MealTimings times={profile.mealTimes} minutesIntoDay={minutesIntoDay} menu={todayMenu.meals ?? undefined} mealAction={(meal) => todayMenu.date && todayMenu.meals?.[meal] && <LateMealAction date={todayMenu.date} meal={todayMenu.meals[meal]} onChanged={todayMenu.reload} onNotice={showNotice} />} />
        </section>}
        <section className="workspace-view portal-profile" data-panel="profile">
          <div className="portal-profile-head"><ProfilePhotoPicker name={profile.name} photoVersion={profile.photoVersion} onChanged={onRefresh} onNotice={showNotice} /><div><p className="eyebrow">Profile</p><h2>{profile.name}</h2><p>{profile.property} · Room {profile.room}</p></div></div>
          <div className="portal-profile-actions"><MyDetailsEditor details={{ name: profile.name, phone: profile.phone, email: profile.email, permanentAddress: profile.permanentAddress, emergencyContactName: profile.emergencyContactName, emergencyContactRelation: profile.emergencyContactRelation, emergencyContactPhone: profile.emergencyContactPhone, vehicleType: profile.vehicleType, vehicleNumber: profile.vehicleNumber, occupation: profile.occupation, hasStudentIdCard: profile.hasStudentIdCard, isIndian: profile.nationality === 'IN', documentNumber: profile.nationality === 'IN' ? profile.aadharNumber : profile.passportNumber }} onChanged={onRefresh} onNotice={showNotice} /><button type="button" className="secondary-button" onClick={() => setIsChangingPassword(true)}><KeyRound size={14} /> Change password</button></div>
          {detailsList}
        </section>
        <PortalFooter businessName={profile.workspace.businessName} termsAndConditions={profile.workspace.termsAndConditions} privacyPolicy={profile.workspace.privacyPolicy} referralCode={profile.referralCode} onNotice={showNotice} />
      </main>
      {isChangingPassword && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsChangingPassword(false)}><div className="profile-modal" role="dialog" aria-labelledby="change-password-title"><div className="modal-heading"><div><p className="eyebrow">Account</p><h2 id="change-password-title">Change password</h2></div><button type="button" className="icon-button" aria-label="Close change password" onClick={() => setIsChangingPassword(false)}><X size={18} /></button></div><ResidentPasswordForm requireCurrent submitLabel="Change password" onCancel={() => setIsChangingPassword(false)} onSaved={() => { setIsChangingPassword(false); showNotice('Password changed. Your other devices were signed out.') }} /></div></div></ModalLayer>}
      {pendingConsent && <PolicyConsentModal consent={pendingConsent} workspace={profile.workspace} onSignOut={onSignOut} onAccepted={async (version) => { if (version) setAcceptedVersion(version); await onRefresh() }} />}
      {isConfirmingSignOut && <SignOutConfirm title="Do you want to logout?" confirmLabel="Yes" cancelLabel="No" onConfirm={() => { setIsConfirmingSignOut(false); onSignOut() }} onCancel={() => setIsConfirmingSignOut(false)} />}
      {openAnnouncement && <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpenAnnouncement(null)}><div className="profile-modal" role="dialog" aria-labelledby="announcement-title">
        <div className="modal-heading"><div><p className="eyebrow">Announcement · {new Date(openAnnouncement.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p><h2 id="announcement-title">{openAnnouncement.title}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setOpenAnnouncement(null)}><X size={18} /></button></div>
        <p className="announcement-message">{openAnnouncement.message}</p>
        <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setOpenAnnouncement(null)}>Close</button></div>
      </div></div></ModalLayer>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
    </FeatureBadgesProvider>
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
  if (!profile) return <PageLoader label="Loading…" />
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
  return <ResidentHome profile={profile} refreshSignal={refreshSignal} onRefresh={refreshPortal} onSignOut={onSignOut} onFireRaised={onFireRaised} />
}
