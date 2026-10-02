import { useCallback, useEffect, useState } from 'react'
import {
  Bell,
  Sparkles,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  DoorOpen,
  Home,
  LayoutGrid,
  Menu,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Users,
  UtensilsCrossed,
  WalletCards,
  X,
  Trash2,
} from 'lucide-react'
import './App.css'
import { ResidentFormModal, type ResidentPrefill } from './ResidentFormModal'
import { BookingRequestsView } from './BookingRequestsView'
import type { BookableProperty, BookingRequest } from './booking'
import type { Resident } from './resident'
import { ResidentsView, type ResidentsLoadState } from './ResidentsView'
import { SuperAdminsView } from './SuperAdminsView'
import type { HousekeepingStatus, OwnerHousekeepingRequest } from './housekeeping'
import { MealTimingFields } from './MealTimings'
import { PropertyFeatureFields, PropertyFeatureTags } from './PropertyFeatures'
import { readPropertyFeatures, tenantHint, type TenantType } from './propertyFeatureOptions'
import { defaultMealTimes, readMealTimes, type MealTimes } from './meals'
import { HousekeepingView } from './HousekeepingView'
import { HousekeepingStaffPanel } from './HousekeepingStaffPanel'
import { FoodView } from './FoodView'
import { formatMonth, type RentSummary } from './rent'
import type { AadharDecision } from './ResidentRow'
import { identityDocumentName } from './identity'
import { SettingsView, type SettingImage } from './SettingsView'
import { BrandMark } from './BrandMark'
import { refreshBranding } from './branding'
import { ThemeToggle } from './ThemeToggle'
import { defaultBusinessName, type WorkspaceSettings } from './workspaceSettings'
import { readApiError, type SuperAdmin } from './superAdmin'
import { RefreshButton } from './RefreshButton'
import { useAutoRefresh, useRefreshSignal } from './useAutoRefresh'
import { useGreeting } from './useGreeting'
import { LocationLink } from './LocationLink'
import { RoomsManager } from './RoomsManager'
import { resizePropertyPhoto } from './imageResize'
import { Pagination } from './Pagination'
import { PhoneField } from './PhoneField'
import { listPageSize, usePagination } from './usePagination'
import { PaymentsView } from './PaymentsView'

type IconType = typeof Home

type Property = {
  id?: string
  name: string
  location: string
  /** City for the resident portal's weather, e.g. "Bengaluru". */
  city?: string | null
  /** Owner's phone (E.164) that residents of this property can call. */
  ownerPhone?: string | null
  occupancy: string
  rooms: string
  status: string
  tone: string
  image: string
  mealTimes?: MealTimes
  tenantType?: TenantType | null
  amenities?: string[]
  totalRooms?: number
  rentWithFood?: number | null
  rentWithoutFood?: number | null
  housekeepingStaff?: string[]
}

const propertyCardsPerPage = 12

type Activity = { title: string; description: string; amount: string; time: string; tone: string; icon: string }
type DashboardData = { source: 'fallback' | 'postgresql'; stats: { properties: string; residents: string; collected: string; openRequests: string; pendingBookings?: number }; properties: Property[]; activity: Activity[] }

const initialDashboard: DashboardData = {
  source: 'fallback',
  stats: { properties: '03', residents: '101', collected: '₹6.42L', openRequests: '12' },
  properties: [
    { name: 'The Fern House', location: 'Koramangala, Bengaluru', occupancy: '92%', rooms: '46 / 50', status: 'Healthy', tone: 'sage', image: 'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80' },
    { name: 'North Star Living', location: 'Hitech City, Hyderabad', occupancy: '78%', rooms: '31 / 40', status: 'Watch', tone: 'gold', image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80' },
    { name: 'Casa 21', location: 'Indiranagar, Bengaluru', occupancy: '96%', rooms: '24 / 25', status: 'Healthy', tone: 'sage', image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80' },
  ],
  activity: [
    { title: 'Rent collected', description: 'The Fern House · Room 204', amount: '+ ₹18,500', time: '12 min ago', tone: 'green', icon: 'wallet' },
    { title: 'New booking request', description: 'North Star Living · Ananya S.', amount: 'Review', time: '38 min ago', tone: 'orange', icon: 'clipboard' },
    { title: 'Maintenance resolved', description: 'Casa 21 · Room 118', amount: 'Closed', time: '1 hr ago', tone: 'blue', icon: 'door' },
  ],
}

async function fetchDashboard() {
  const response = await fetch('/api/dashboard')
  if (!response.ok) throw new Error('Dashboard request failed')
  return await response.json() as DashboardData
}

async function fetchHousekeeping() {
  const response = await fetch('/api/housekeeping')
  if (!response.ok) throw new Error('Housekeeping request failed')
  return await response.json() as OwnerHousekeepingRequest[]
}

async function fetchResidents() {
  const response = await fetch('/api/residents')
  if (!response.ok) throw new Error('Residents request failed')
  return await response.json() as Resident[]
}

/** Owner dashboard, rendered only for a signed-in super admin (see AuthGate). */
function App({ currentAdmin, onSignOut, onAdminChange }: { currentAdmin: SuperAdmin; onSignOut: () => Promise<void>; onAdminChange: (admin: SuperAdmin) => void }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [propertyFilter, setPropertyFilter] = useState('All properties')
  const [activeView, setActiveView] = useState('Overview')
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false)
  const [roomsProperty, setRoomsProperty] = useState<Property | null>(null)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false)
  const profileName = currentAdmin.name
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const businessName = settings?.businessName ?? defaultBusinessName
  const { greeting, dateLabel } = useGreeting()
  const profileInitials =profileName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const [residents, setResidents] = useState<Resident[]>([])
  const [residentsLoadState, setResidentsLoadState] = useState<ResidentsLoadState>('loading')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [housekeeping, setHousekeeping] = useState<OwnerHousekeepingRequest[]>([])
  const [housekeepingLoadState, setHousekeepingLoadState] = useState<ResidentsLoadState>('loading')
  // New requests plus unanswered "cleaner did not turn up" reminders: everything waiting on the owner.
  const rentOverdueCount = residents.filter((resident) => resident.rent?.state === 'LOCK_DUE').length
  const newHousekeepingCount = housekeeping.filter((request) => request.status === 'REQUESTED' || request.hasOpenReminder).length
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date())
  // null = closed; undefined resident = add mode.
  // prefill/onCreated are set when a booking request is being converted into a resident.
  const [residentForm, setResidentForm] = useState<{ resident?: Resident; prefill?: ResidentPrefill; onCreated?: (residentId: string) => void } | null>(null)
  const [notice, setNotice] = useState('')
  const [selectedImage, setSelectedImage] = useState('')
  const [editingImage, setEditingImage] = useState('')
  const [dashboard, setDashboard] = useState(initialDashboard)
  const { properties, activity, stats } = dashboard
  // Only saved properties (with an id) can take a booking; the form needs just these fields.
  const bookableProperties: BookableProperty[] = properties.flatMap((property) => property.id ? [{ id: property.id, name: property.name, location: property.location, tenantType: property.tenantType ?? null, rentWithFood: property.rentWithFood ?? null, rentWithoutFood: property.rentWithoutFood ?? null }] : [])

  useEffect(() => {
    fetchDashboard().then(setDashboard).catch(() => undefined)
  }, [])

  // One refresh for the whole workspace, shared by the header button and the one-minute timer.
  // Silent: a failed attempt keeps what is on screen, and lists update in place so open filters
  // and expanded rows are untouched. Child views reload when refreshSignal changes.
  async function refreshWorkspace() {
    setRefreshSignal((signal) => signal + 1)
    await Promise.allSettled([fetchDashboard().then(setDashboard), fetchResidents().then(showResidents), fetchHousekeeping().then(showHousekeeping)])
    setLastRefreshedAt(new Date())
  }

  useAutoRefresh(() => { void refreshWorkspace() })

  // A failed load is shown as an error with Retry rather than as an empty list, which would
  // misleadingly read as "you have no residents".
  function showResidents(list: Resident[]) {
    setResidents(list)
    setResidentsLoadState('ready')
  }

  function showResidentsError() {
    setResidentsLoadState('error')
  }

  // Loaded here rather than in the page so the sidebar badge can count new requests anywhere.
  function showHousekeeping(list: OwnerHousekeepingRequest[]) {
    setHousekeeping(list)
    setHousekeepingLoadState('ready')
  }

  function retryHousekeeping() {
    setHousekeepingLoadState('loading')
    fetchHousekeeping().then(showHousekeeping, () => setHousekeepingLoadState('error'))
  }

  useEffect(() => {
    fetchHousekeeping().then(showHousekeeping, () => setHousekeepingLoadState('error'))
  }, [])

  // Returns an error message for the row to show inline, or null when the change was saved.
  // A null status sends a reply (note only), which also answers any open reminder.
  async function updateHousekeeping(request: OwnerHousekeepingRequest, status: HousekeepingStatus | null, ownerNote: string) {
    const response = await fetch(`/api/housekeeping/${request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(status ? { status } : {}), ownerNote }) }).catch(() => null)
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not update the request.')
    const updated = await response.json() as OwnerHousekeepingRequest
    setHousekeeping((current) => current.map((item) => item.id === updated.id ? updated : item))
    showNotice(status ? `Housekeeping for ${request.resident.name} is now ${status.toLowerCase()}.` : `Reply sent to ${request.resident.name}.`)
    return null
  }

  useEffect(() => {
    fetch('/api/settings').then((response) => response.ok ? response.json() as Promise<WorkspaceSettings> : Promise.reject(new Error('Settings request failed'))).then(setSettings).catch(() => undefined)
  }, [])

  // Settings changes (rent days, slot hours) alter what residents and requests show, so reload them too.
  async function saveSettings(changes: Partial<WorkspaceSettings>) {
    const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) }).catch(() => null)
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not save settings.')
    setSettings(await response.json() as WorkspaceSettings)
    refreshBranding()
    void refreshWorkspace()
    return null
  }

  async function saveImage(kind: SettingImage, image: string | null) {
    const response = await fetch(`/api/settings/${kind}`, image ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) } : { method: 'DELETE' }).catch(() => null)
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not update the image.')
    setSettings(await response.json() as WorkspaceSettings)
    if (kind === 'logo') refreshBranding()
    return null
  }

  async function saveAccount(changes: Record<string, string>) {
    const response = await fetch('/api/auth/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) }).catch(() => null)
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not update your account.')
    onAdminChange((await response.json() as { admin: SuperAdmin }).admin)
    return null
  }

  function retryResidents() {
    setResidentsLoadState('loading')
    fetchResidents().then(showResidents, showResidentsError)
  }

  useEffect(() => {
    fetchResidents().then(showResidents, showResidentsError)
  }, [])

  // Stable identity so child views can list it as an effect dependency without refetching on every render.
  const showNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }, [])

  function handleNavigation(label: string) {
    setActiveView(label)
    setIsSidebarOpen(false)
    // Only Settings is still a placeholder; every other page is a working module.
  }

  async function addProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), location: form.get('location'), city: form.get('city'), ownerPhone: form.get('ownerPhone'), imageUrl: selectedImage || form.get('imageUrl'), ...readPropertyFeatures(form) }) })
    if (!response.ok) { showNotice(await readApiError(response, 'Could not add the property. Check the required fields.')); return }
    const result = await response.json() as { property: Property }
    setDashboard((current) => ({ ...current, properties: [...current.properties, result.property], stats: { ...current.stats, properties: String(current.properties.length + 1).padStart(2, '0') } }))
    setIsPropertyModalOpen(false)
    setSelectedImage('')
    showNotice('Property added successfully.')
  }

  async function deleteProperty(property: Property) {
    if (!property.id) { showNotice('This property cannot be deleted until it has a database ID.'); return }
    if (!window.confirm(`Delete ${property.name}? Its rooms, residents, payments, requests, and activity will also be removed.`)) return
    const response = await fetch(`/api/properties/${property.id}`, { method: 'DELETE' })
    if (!response.ok) { showNotice('Could not delete the property.'); return }
    setDashboard((current) => ({ ...current, properties: current.properties.filter((item) => item.id !== property.id), stats: { ...current.stats, properties: String(Math.max(0, current.properties.length - 1)).padStart(2, '0') } }))
    showNotice(`${property.name} deleted.`)
  }

  async function updateProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingProperty?.id) return
    const form = new FormData(event.currentTarget)
    const payload = { name: form.get('name'), location: form.get('location'), city: form.get('city'), ownerPhone: form.get('ownerPhone'), status: form.get('status'), imageUrl: editingImage || form.get('imageUrl'), mealTimes: readMealTimes(form), ...readPropertyFeatures(form) }
    const response = await fetch(`/api/properties/${editingProperty.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!response.ok) { showNotice(await readApiError(response, 'Could not update property.')); return }
    const result = await response.json() as { name: string; location: string; city: string | null; ownerPhone: string | null; status: string; imageUrl: string; mealTimes: MealTimes; tenantType: TenantType | null; amenities: string[]; totalRooms: number; rentWithFood: number | null; rentWithoutFood: number | null; occupancy: string; rooms: string }
    setDashboard((current) => ({ ...current, properties: current.properties.map((property) => property.id === editingProperty.id ? { ...property, name: result.name, location: result.location, city: result.city, ownerPhone: result.ownerPhone, status: result.status, tone: result.status === 'Healthy' ? 'sage' : 'gold', image: result.imageUrl, mealTimes: result.mealTimes, tenantType: result.tenantType, amenities: result.amenities, totalRooms: result.totalRooms, rentWithFood: result.rentWithFood, rentWithoutFood: result.rentWithoutFood, occupancy: result.occupancy, rooms: result.rooms } : property) }))
    // Prices may have changed residents' rents; refresh the list quietly.
    fetchResidents().then(showResidents, () => undefined)
    setEditingProperty(null)
    setEditingImage('')
    showNotice('Property updated successfully.')
  }


  function saveResident(saved: Resident) {
    setResidents((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current])
    residentForm?.onCreated?.(saved.id)
    setResidentForm(null)
  }

  function saveStaff(propertyId: string, names: string[]) {
    setDashboard((current) => ({ ...current, properties: current.properties.map((property) => property.id === propertyId ? { ...property, housekeepingStaff: names } : property) }))
  }

  // Opens "Add resident" filled in from a booking request; saving it marks the request accepted.
  function convertBooking(booking: BookingRequest, onConverted: (residentId: string) => void) {
    setResidentForm({ prefill: { name: booking.name, phone: booking.phone, email: booking.email, propertyId: booking.propertyId, foodOpted: booking.foodOpted, joinedAt: booking.moveInDate }, onCreated: onConverted })
  }

  // Returns an error message for the row to show inline, or null when the decision was saved.
  // Rent routes return the fresh rent summary; merge it into the resident so the row updates in place.
  async function changeRent(resident: Resident, request: Promise<Response | null>, success: string) {
    const response = await request
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not update the rent.')
    const rent = await response.json() as RentSummary
    setResidents((current) => current.map((item) => item.id === resident.id ? { ...item, rent } : item))
    showNotice(success)
    return null
  }

  function recordRent(resident: Resident, month: string) {
    return changeRent(resident, fetch(`/api/residents/${resident.id}/rent-payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) }).catch(() => null), `Rent for ${formatMonth(month)} recorded for ${resident.name}.`)
  }

  function undoRent(resident: Resident, paymentId: string) {
    return changeRent(resident, fetch(`/api/residents/${resident.id}/rent-payments/${paymentId}`, { method: 'DELETE' }).catch(() => null), `Payment removed for ${resident.name}.`)
  }

  async function verifyResident(resident: Resident, decision: AadharDecision) {
    const response = await fetch(`/api/residents/${resident.id}/aadhar-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision) }).catch(() => null)
    if (!response) return 'Could not reach the server.'
    if (!response.ok) return readApiError(response, 'Could not save the verification.')
    const updated = await response.json() as Resident
    setResidents((current) => current.map((item) => item.id === updated.id ? updated : item))
    showNotice(decision.decision === 'approve' ? `${resident.name}'s ${identityDocumentName(resident.nationality)} is verified. They can now use the resident portal.` : `${resident.name}'s ${identityDocumentName(resident.nationality)} was rejected. They will see your reason and can resubmit.`)
    return null
  }

  async function deleteResident(resident: Resident) {
    if (!window.confirm(`Remove ${resident.name} from ${resident.property}?`)) return
    const response = await fetch(`/api/residents/${resident.id}`, { method: 'DELETE' })
    if (!response.ok) { showNotice('Could not remove resident.'); return }
    setResidents((current) => current.filter((item) => item.id !== resident.id))
    showNotice(`${resident.name} removed.`)
  }

  // Both property forms. Resized in the browser, so a full-size phone photo is accepted instead of
  // being turned away (the old 2 MB cap silently kept the previous photo).
  async function choosePropertyPhoto(event: React.ChangeEvent<HTMLInputElement>, onPhoto: (dataUrl: string) => void) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizePropertyPhoto(file)
    if ('error' in result) { showNotice(result.error); return }
    onPhoto(result.dataUrl)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <BrandMark />
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setIsSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace-switcher"><span className="workspace-dot">{businessName.charAt(0).toUpperCase()}</span><span><strong>{businessName}</strong><small>Owner workspace</small></span><ChevronDown size={15} /></div>
        <nav className="primary-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          <NavItem icon={LayoutGrid} label="Overview" active={activeView === 'Overview'} onClick={() => handleNavigation('Overview')} />
          <NavItem icon={Building2} label="Properties" badge={stats.properties} active={activeView === 'Properties'} onClick={() => handleNavigation('Properties')} />
          <NavItem icon={Users} label="Residents" badge={rentOverdueCount ? String(rentOverdueCount) : undefined} active={activeView === 'Residents'} onClick={() => handleNavigation('Residents')} />
          <NavItem icon={ClipboardList} label="Booking requests" badge={stats.pendingBookings ? String(stats.pendingBookings) : undefined} active={activeView === 'Booking requests'} onClick={() => handleNavigation('Booking requests')} />
          <NavItem icon={WalletCards} label="Payments" active={activeView === 'Payments'} onClick={() => handleNavigation('Payments')} />
          <p className="nav-label nav-label-spaced">Manage</p>
          <NavItem icon={Sparkles} label="Housekeeping" badge={newHousekeepingCount ? String(newHousekeepingCount) : undefined} active={activeView === 'Housekeeping'} onClick={() => handleNavigation('Housekeeping')} />
          <NavItem icon={UtensilsCrossed} label="Food" active={activeView === 'Food'} onClick={() => handleNavigation('Food')} />
          <NavItem icon={Bell} label="Announcements" active={activeView === 'Announcements'} onClick={() => handleNavigation('Announcements')} />
          <NavItem icon={ShieldCheck} label="Super admins" active={activeView === 'Super admins'} onClick={() => handleNavigation('Super admins')} />
          <NavItem icon={Settings} label="Settings" active={activeView === 'Settings'} onClick={() => handleNavigation('Settings')} />
        </nav>
        <div className="sidebar-footer"><div className="help-icon"><ShieldCheck size={18} /></div><div><strong>{dashboard.source === 'postgresql' ? 'Database connected' : 'Local API connected'}</strong><small>{dashboard.source === 'postgresql' ? 'Live PostgreSQL data' : 'Fallback data active'}</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-trigger" aria-label="Open navigation" onClick={() => setIsSidebarOpen(true)}><Menu size={21} /></button>
          <div className="topbar-heading"><span className="home-title">Admin Home</span><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeView}</strong></div></div>
          <div className="topbar-actions"><ThemeToggle /><RefreshButton onRefresh={refreshWorkspace} lastUpdated={lastRefreshedAt} /><button className="icon-button notification-button" aria-label="View notifications" onClick={() => { setIsNotificationsOpen((open) => !open); setIsProfileOpen(false) }}><Bell size={19} /><i /></button><button className="profile" aria-expanded={isProfileOpen} onClick={() => { setIsProfileOpen((open) => !open); setIsNotificationsOpen(false) }}><span className="avatar">{profileInitials}</span><span>{profileName}</span><ChevronDown size={15} /></button>{isNotificationsOpen && <div className="notification-popover"><strong>Notifications</strong><p>4 residents have paid rent this week.</p><p>2 rooms are ready to list.</p></div>}{isProfileOpen && <div className="profile-popover"><div className="profile-popover-header"><span className="avatar">{profileInitials}</span><div><strong>{profileName}</strong><small>Super admin</small></div></div><button onClick={() => { setIsProfileOpen(false); handleNavigation('Settings') }}>Profile details <span>↗</span></button><button onClick={() => { setIsProfileOpen(false); handleNavigation('Settings') }}>Workspace settings <Settings size={14} /></button><button className="profile-signout" onClick={() => { setIsProfileOpen(false); setIsSignOutModalOpen(true) }}>Sign out</button></div>}</div>
        </header>
        <div className="page-content">
          <section className="welcome-row"><div><p className="eyebrow">{dateLabel}</p><h1>{greeting}, {profileName.split(' ')[0]} <span className="wave">✦</span></h1><p className="subtitle">Here is what is happening across your properties today.</p></div>{activeView === 'Overview' && <button className="primary-button" onClick={() => setIsPropertyModalOpen(true)}><Plus size={18} /> Add property</button>}</section>

          {activeView === 'Residents' && <ResidentsView residents={residents} loadState={residentsLoadState} onRetry={retryResidents} onAdd={() => setResidentForm({})} onEdit={(resident) => setResidentForm({ resident })} onDelete={deleteResident} onVerify={verifyResident} onRecordRent={recordRent} onUndoRent={undoRent} onChanged={() => { fetchResidents().then(showResidents, () => undefined) }} onNotice={showNotice} onBack={() => handleNavigation('Overview')} />}
          {activeView === 'Properties' && <PropertiesView properties={properties} stats={stats} onAdd={() => setIsPropertyModalOpen(true)} onEdit={(property) => setEditingProperty(property)} onRooms={(property) => setRoomsProperty(property)} onDelete={deleteProperty} onBack={() => handleNavigation('Overview')} />}
          {activeView === 'Payments' && <PaymentsView properties={properties.flatMap((property) => property.id ? [{ id: property.id, name: property.name }] : [])} residents={residents} refreshSignal={refreshSignal} onBack={() => handleNavigation('Overview')} onNotice={showNotice} />}
          {activeView === 'Booking requests' && <BookingRequestsView properties={bookableProperties} refreshSignal={refreshSignal} onConvert={convertBooking} onBack={() => handleNavigation('Overview')} onNotice={showNotice} />}
          {activeView === 'Announcements' && <CrudView view={activeView} properties={properties} refreshSignal={refreshSignal} onBack={() => handleNavigation('Overview')} onNotice={showNotice} />}
          {activeView === 'Super admins' && <SuperAdminsView currentAdminId={currentAdmin.id} refreshSignal={refreshSignal} onBack={() => handleNavigation('Overview')} onNotice={showNotice} onAdminChange={onAdminChange} />}
          {activeView === 'Housekeeping' && <HousekeepingView requests={housekeeping} loadState={housekeepingLoadState} staff={<HousekeepingStaffPanel properties={properties.flatMap((property) => property.id ? [{ id: property.id, name: property.name, housekeepingStaff: property.housekeepingStaff ?? [] }] : [])} onSaved={saveStaff} onNotice={showNotice} />} onRetry={retryHousekeeping} onUpdate={updateHousekeeping} onBack={() => handleNavigation('Overview')} />}
          {activeView === 'Food' && <FoodView properties={properties} refreshSignal={refreshSignal} onBack={() => handleNavigation('Overview')} onNotice={showNotice} />}
          {activeView === 'Settings' && <SettingsView admin={currentAdmin} settings={settings} onSaveAccount={saveAccount} onSaveSettings={saveSettings} onSaveImage={saveImage} onNotice={showNotice} onBack={() => handleNavigation('Overview')} />}
          {activeView !== 'Overview' && activeView !== 'Residents' && activeView !== 'Super admins' && activeView !== 'Housekeeping' && activeView !== 'Food' && activeView !== 'Settings' && activeView !== 'Properties' && !['Booking requests', 'Payments', 'Announcements'].includes(activeView) && <WorkspaceView view={activeView} stats={stats} onBack={() => handleNavigation('Overview')} />}
          <div className={activeView === 'Overview' ? 'dashboard-view' : 'dashboard-view view-hidden'}>
          <section className="stat-grid" aria-label="Property summary">
            <StatCard icon={Building2} label="Total properties" value={stats.properties} detail="All properties active" accent="teal" />
            <StatCard icon={Users} label="Active residents" value={stats.residents} detail="↑ 8.4% from last month" accent="coral" />
            <StatCard icon={CircleDollarSign} label="Collected this month" value={stats.collected} detail="78% of expected rent" accent="blue" />
            <StatCard icon={ClipboardList} label="Open requests" value={stats.openRequests} detail="4 need your attention" accent="gold" />
          </section>

          <section className="dashboard-grid">
            <div className="panel properties-panel"><div className="panel-heading"><div><h2>Your properties</h2><p>Occupancy and performance at a glance</p></div><div className="filter-wrap"><select aria-label="Filter properties" value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><option>All properties</option><option>Healthy</option><option>Watch</option></select><ChevronDown size={15} /></div></div><div className="property-list">{properties.filter((property) => propertyFilter === 'All properties' || property.status === propertyFilter).map((property) => <PropertyRow key={property.id ?? property.name} {...property} onOpen={() => showNotice(`${property.name} selected.`)} onEdit={() => setEditingProperty(property)} onDelete={() => deleteProperty(property)} />)}</div><button className="text-button" onClick={() => { setPropertyFilter('All properties'); showNotice(`Showing all ${properties.length} properties.`) }}>View all properties <span>↗</span></button></div>
            <div className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates from your workspace</p></div><button className="more-button" aria-label="More activity options" onClick={() => showNotice('Activity options opened.')}>•••</button></div><div className="activity-list">{activity.map(({ icon, ...item }) => <ActivityItem key={item.title} icon={icon === 'wallet' ? WalletCards : icon === 'door' ? DoorOpen : ClipboardList} {...item} />)}</div><button className="text-button" onClick={() => showNotice('All workspace activity is up to date.')}>See all activity <span>↗</span></button></div>
          </section>

          <section className="bottom-grid"><div className="insight-banner"><div className="insight-graphic"><span>₹</span><div className="insight-line line-one" /><div className="insight-line line-two" /></div><div><p className="eyebrow">Monthly insight</p><h2>Rent collection is up <strong>12.6%</strong></h2><p>Compared to the same period last month.</p></div><button className="outline-button" onClick={() => showNotice('Monthly rent report requested.')}>View report</button></div><div className="tip-card"><div className="tip-icon"><DoorOpen size={19} /></div><div><p className="eyebrow">Quick tip</p><h3>Keep your rooms moving</h3><p>2 rooms are ready to be listed at North Star.</p></div><button className="arrow-button" aria-label="Open quick tip" onClick={() => showNotice('North Star listing tip opened.')}>↗</button></div></section>
          </div>
        </div>
        {notice && <div className="toast" role="status">{notice}</div>}
        {isSignOutModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsSignOutModalOpen(false)}><div className="confirm-modal"><div className="confirm-icon"><ShieldCheck size={22} /></div><h2>Sign out?</h2><p>You will return to the login screen.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setIsSignOutModalOpen(false)}>Cancel</button><button className="danger-button" onClick={() => { setIsSignOutModalOpen(false); void onSignOut() }}>Sign out</button></div></div></div>}
        {roomsProperty?.id && <RoomsManager propertyId={roomsProperty.id} propertyName={roomsProperty.name} onClose={() => setRoomsProperty(null)} onNotice={showNotice} />}
        {residentForm && <ResidentFormModal resident={residentForm.resident} prefill={residentForm.prefill} properties={properties} onClose={() => setResidentForm(null)} onSaved={saveResident} onNotice={showNotice} />}
        {isPropertyModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setIsPropertyModalOpen(false); setSelectedImage('') } }}><form className="property-modal" onSubmit={addProperty}><div className="modal-heading"><div><p className="eyebrow">Workspace</p><h2>Add property</h2></div><button type="button" className="icon-button" aria-label="Close add property dialog" onClick={() => { setIsPropertyModalOpen(false); setSelectedImage('') }}><X size={18} /></button></div><label>Property name<input name="name" required placeholder="e.g. Palm Grove PG" /></label><label>Location<input name="location" required placeholder="e.g. Whitefield, Bengaluru" /></label><label>City <span>(shows residents the local weather)</span><input name="city" maxLength={60} placeholder="e.g. Bengaluru" /></label><PhoneField name="ownerPhone" label="Owner number" hint="(residents can call it from their portal)" /><PropertyFeatureFields /><div className="image-upload"><div className="upload-preview">{selectedImage ? <img src={selectedImage} alt="Selected property" /> : <Plus size={20} />}</div><div><strong>{selectedImage ? 'Image selected' : 'Property image'}</strong><small>Any photo; large ones are resized</small><label className="browse-button">Browse local image<input type="file" accept="image/*" onChange={(event) => { void choosePropertyPhoto(event, setSelectedImage) }} /></label></div></div><input name="imageUrl" type="url" className="image-url-input" placeholder="Or paste an image URL (optional)" /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setIsPropertyModalOpen(false); setSelectedImage('') }}>Cancel</button><button type="submit" className="primary-button"><Plus size={17} /> Save property</button></div></form></div>}
        {editingProperty && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && (setEditingProperty(null), setEditingImage(''))}><form className="property-modal" onSubmit={updateProperty}><div className="modal-heading"><div><p className="eyebrow">Your properties</p><h2>Edit property</h2></div><button type="button" className="icon-button" aria-label="Close edit property" onClick={() => { setEditingProperty(null); setEditingImage('') }}><X size={18} /></button></div><label>Property name<input name="name" defaultValue={editingProperty.name} required /></label><label>Location<input name="location" defaultValue={editingProperty.location} required /></label><label>City <span>(shows residents the local weather)</span><input name="city" maxLength={60} defaultValue={editingProperty.city ?? ''} placeholder="e.g. Bengaluru" /></label><PhoneField name="ownerPhone" label="Owner number" hint="(residents can call it from their portal)" defaultValue={editingProperty.ownerPhone ?? ''} /><label>Status<select name="status" defaultValue={editingProperty.status}><option>Healthy</option><option>Watch</option></select></label><PropertyFeatureFields totalRooms={editingProperty.totalRooms} tenantType={editingProperty.tenantType} amenities={editingProperty.amenities} rentWithFood={editingProperty.rentWithFood} rentWithoutFood={editingProperty.rentWithoutFood} /><MealTimingFields times={editingProperty.mealTimes ?? defaultMealTimes} /><div className="image-upload"><div className="upload-preview"><img src={editingImage || editingProperty.image} alt="Property preview" /></div><div><strong>{editingImage ? 'New image selected' : 'Property image'}</strong><small>Any photo; large ones are resized</small><label className="browse-button">Browse local image<input type="file" accept="image/*" onChange={(event) => { void choosePropertyPhoto(event, setEditingImage) }} /></label></div></div><input name="imageUrl" type="url" className="image-url-input" defaultValue={editingProperty.image} placeholder="Or paste an image URL" /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setEditingProperty(null); setEditingImage('') }}>Cancel</button><button type="submit" className="primary-button">Save changes</button></div></form></div>}
      </main>
    </div>
  )
}

function NavItem({ icon: Icon, label, badge, active = false, onClick }: { icon: IconType; label: string; badge?: string; active?: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><Icon size={18} /><span>{label}</span>{badge && <b>{badge}</b>}</button> }
function StatCard({ icon: Icon, label, value, detail, accent }: { icon: IconType; label: string; value: string; detail: string; accent: string }) { return <article className={`stat-card ${accent}`}><div className="stat-icon"><Icon size={19} /></div><p>{label}</p><strong>{value}</strong><small>{detail}</small></article> }
function WorkspaceView({ view, stats, onBack }: { view: string; stats: DashboardData['stats']; onBack: () => void }) {
  const descriptions: Record<string, string> = { Properties: 'Manage your PG buildings, rooms, and occupancy.', Residents: 'View active residents and their room assignments.', 'Booking requests': 'Review booking requests and upcoming move-ins.', Payments: 'Track rent collection and payment activity.', Announcements: 'Send updates and notices to your residents.', Settings: 'Configure workspace preferences and account details.' }
  return <section className="workspace-view"><div className="workspace-view-heading"><div><p className="eyebrow">Workspace module</p><h2>{view}</h2><p>{descriptions[view] ?? 'Workspace details'}</p></div><button className="secondary-button" onClick={onBack}>Back to overview</button></div><div className="workspace-summary"><div><span>Properties</span><strong>{stats.properties}</strong></div><div><span>Residents</span><strong>{stats.residents}</strong></div><div><span>Live records</span><strong>{view === 'Payments' ? stats.collected : stats.openRequests}</strong></div></div><div className="workspace-empty"><div className="workspace-empty-icon"><Building2 size={22} /></div><h3>{view} workspace</h3><p>This section is connected to the same PostgreSQL-backed workspace. Its detailed controls are ready for the next module.</p></div></section>
}
// Rejects on an error status so an `{ error }` body is never rendered as a list of records.
async function fetchRecords(endpoint: string) {
  const response = await fetch(`/api/${endpoint}`)
  if (!response.ok) throw new Error(`${endpoint} request failed`)
  return await response.json() as Array<Record<string, unknown>>
}

function CrudView({ view, properties, refreshSignal, onBack, onNotice }: { view: string; properties: Property[]; refreshSignal: number; onBack: () => void; onNotice: (message: string) => void }) {
  const endpoint = 'announcements'
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  // Keyed by view so the list starts at page 1 if another view ever reuses this component.
  const recordsPager = usePagination(records, listPageSize, view)
  useEffect(() => { fetchRecords(endpoint).then(setRecords).catch(() => onNotice(`${view} could not be loaded.`)) }, [endpoint, refresh, view, onNotice])
  useRefreshSignal(refreshSignal, () => { fetchRecords(endpoint).then(setRecords).catch(() => undefined) })
  const labels = ['title', 'message', 'property']
  const createRecord = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries()); const response = await fetch(`/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) { onNotice('Could not create the record.'); return } setIsAddOpen(false); setRefresh((value) => value + 1); onNotice(`${view.slice(0, -1)} created.`) }
  const removeRecord = async (id: unknown) => { if (!window.confirm(`Delete this ${view.slice(0, -1).toLowerCase()}?`)) return; const response = await fetch(`/api/${endpoint}/${String(id)}`, { method: 'DELETE' }); if (response.ok) { setRefresh((value) => value + 1); onNotice('Record deleted.') } }
  const editRecord = async (record: Record<string, unknown>) => { const field = labels[0]; const value = window.prompt(`Update ${field}`, String(record[field] ?? '')); if (value === null || !value.trim()) return; const response = await fetch(`/api/${endpoint}/${String(record.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) }); if (response.ok) { setRefresh((current) => current + 1); onNotice('Record updated.') } }
  return <section className="workspace-view crud-view"><div className="workspace-view-heading"><div><p className="eyebrow">Workspace module</p><h2>{view}</h2><p>Manage {view.toLowerCase()} with create, edit, and delete actions.</p></div><div className="view-actions"><button className="primary-button" onClick={() => setIsAddOpen(true)}><Plus size={16} /> Add {view.slice(0, -1).toLowerCase()}</button><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div><div className="crud-list">{records.length ? recordsPager.pageItems.map((record) => <div className="crud-row" key={String(record.id)}><div className="crud-main"><strong>{String(record[labels[0]] ?? '')}</strong><small>{labels.slice(1).map((label) => `${label}: ${String(record[label] ?? '')}`).join(' · ')}</small></div><div className="crud-actions"><button className="secondary-button" onClick={() => editRecord(record)}>Edit</button><button className="row-delete" aria-label="Delete record" onClick={() => removeRecord(record.id)}><Trash2 size={14} /></button></div></div>) : <div className="workspace-empty"><div className="workspace-empty-icon"><ClipboardList size={22} /></div><h3>No {view.toLowerCase()} yet</h3><p>Create the first record to start managing this workspace.</p></div>}</div><Pagination state={recordsPager} label={view} />{isAddOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsAddOpen(false)}><form className="profile-modal" onSubmit={createRecord}><div className="modal-heading"><div><p className="eyebrow">{view}</p><h2>Add {view.slice(0, -1).toLowerCase()}</h2></div><button type="button" className="icon-button" onClick={() => setIsAddOpen(false)}><X size={18} /></button></div>{view === 'Announcements' && <><label>Title<input name="title" required /></label><label>Message<input name="message" required /></label></>}<label>Property<select name="propertyId" required defaultValue=""><option value="" disabled>Select property</option>{properties.filter((property) => property.id).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsAddOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={16} /> Save</button></div></form></div>}</section>
}
function PropertiesView({ properties, stats, onAdd, onEdit, onRooms, onDelete, onBack }: { properties: Property[]; stats: DashboardData['stats']; onAdd: () => void; onEdit: (property: Property) => void; onRooms: (property: Property) => void; onDelete: (property: Property) => void; onBack: () => void }) {
  // 12 cards fill whole rows at 1, 2, 3 or 4 columns.
  const propertiesPager = usePagination(properties, propertyCardsPerPage)
  return <section className="workspace-view properties-view"><div className="workspace-view-heading"><div><p className="eyebrow">Workspace module</p><h2>Properties</h2><p>Manage your PG buildings, rooms, and occupancy.</p></div><div className="view-actions"><button className="primary-button" onClick={onAdd}><Plus size={16} /> Add property</button><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div><div className="workspace-summary"><div><span>Properties</span><strong>{stats.properties}</strong></div><div><span>Active residents</span><strong>{stats.residents}</strong></div><div><span>Live records</span><strong>{properties.length}</strong></div></div><div className="property-card-grid">{propertiesPager.pageItems.map((property) => <article className="property-card" key={property.id ?? property.name} onClick={(event) => { if (!(event.target as HTMLElement).closest('button, a')) onEdit(property) }}><img src={property.image} alt="" /><div className="property-card-body"><div className="property-card-title"><div><h3>{property.name}</h3><p><LocationLink className="detail-location" property={property.name} location={property.location} /></p></div><span className={`status-pill ${property.tone}`}>{property.status}</span></div><PropertyFeatureTags tenantType={property.tenantType} amenities={property.amenities} /><div className="property-card-metrics"><div><span>Occupancy</span><strong>{property.occupancy}</strong></div><div><span>Rooms</span><strong>{property.rooms}</strong></div></div><div className="property-card-actions"><div className="progress"><i style={{ width: property.occupancy }} /></div>{property.id && <button className="row-edit grid-edit" aria-label={`Rooms in ${property.name}`} title="Rooms" onClick={() => onRooms(property)}><DoorOpen size={14} /></button>}<button className="row-edit grid-edit" aria-label={`Edit ${property.name}`} title="Edit property" onClick={() => onEdit(property)}><Pencil size={14} /></button><button className="row-delete" aria-label={`Delete ${property.name}`} title="Delete property" onClick={() => onDelete(property)}><Trash2 size={14} /></button></div></div></article>)}</div><Pagination state={propertiesPager} label="Properties" /></section>
}
function PropertyRow({ name, location, occupancy, rooms, status, tone, image, tenantType, onOpen, onEdit, onDelete }: Property & { onOpen: () => void; onEdit: () => void; onDelete: () => void }) { return <div className="property-row"><img src={image} alt="" /><div className="property-info"><h3>{name}</h3><p><LocationLink className="detail-location" property={name} location={location} />{tenantHint(tenantType) ? ` · ${tenantHint(tenantType)}` : ''}</p></div><div className="occupancy"><span>Occupancy</span><strong>{occupancy}</strong><div className="progress"><i style={{ width: occupancy }} /></div></div><div className="rooms"><span>Rooms</span><strong>{rooms}</strong></div><span className={`status-pill ${tone}`}>{status}</span><div className="row-actions"><button className="row-arrow" aria-label={`Open ${name}`} onClick={onOpen}>↗</button><button className="row-edit" aria-label={`Edit ${name}`} title="Edit property" onClick={onEdit}><Pencil size={14} /></button><button className="row-delete" aria-label={`Delete ${name}`} title="Delete property" onClick={onDelete}><Trash2 size={14} /></button></div></div> }
function ActivityItem({ icon: Icon, title, description, amount, time, tone }: { icon: IconType; title: string; description: string; amount: string; time: string; tone: string }) { return <div className="activity-item"><div className={`activity-icon ${tone}`}><Icon size={17} /></div><div className="activity-copy"><h3>{title}</h3><p>{description}</p></div><div className="activity-meta"><strong className={tone}>{amount}</strong><span>{time}</span></div></div> }

export default App
