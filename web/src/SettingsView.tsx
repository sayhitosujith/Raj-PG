import { useRef, useState, type ReactNode } from 'react'
import { Building2, CalendarClock, Check, FileText, House, ImageUp, Sparkles, Trash2, UserRound, WalletCards } from 'lucide-react'
import { logoUrl } from './branding'
import { resizeLogo } from './imageResize'
import { ordinal } from './rent'
import type { SuperAdmin } from './superAdmin'
import type { WorkspaceSettings } from './workspaceSettings'

type SaveResult = Promise<string | null>
const policySections = [{ field: 'termsAndConditions', title: 'Terms and conditions' }, { field: 'privacyPolicy', title: 'Privacy policy' }] as const
const dayOptions = Array.from({ length: 28 }, (_, index) => index + 1)

/** One Settings card with its own form, Save button and inline result, so sections save independently. */
function SettingsSection({ icon, title, description, onSubmit, children, wide = false }: { icon: ReactNode; title: string; description: string; onSubmit: (form: FormData) => SaveResult; children: ReactNode; wide?: boolean }) {
  const [message, setMessage] = useState<{ tone: 'error' | 'saved'; text: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setIsSaving(true)
    setMessage(null)
    const error = await onSubmit(new FormData(form))
    setIsSaving(false)
    setMessage(error ? { tone: 'error', text: error } : { tone: 'saved', text: 'Saved.' })
  }

  return (
    <form className={`settings-section${wide ? ' wide' : ''}`} onSubmit={submit}>
      <div className="settings-section-head"><span className="settings-section-icon">{icon}</span><div><h3>{title}</h3><p>{description}</p></div></div>
      <div className="settings-fields">{children}</div>
      <div className="settings-actions">
        {message && <span className={`settings-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'saved' && <Check size={13} />}{message.text}</span>}
        <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

const value = (form: FormData, name: string) => String(form.get(name) ?? '')
// Blank number inputs mean "not set" (sent as null); the server validates the range.
const optionalNumber = (form: FormData, name: string) => value(form, name).trim() ? Number(value(form, name)) : null

type WindowKey = 'morning' | 'afternoon' | 'evening' | 'visiting' | 'quiet'
const windowFields = (form: FormData, keys: WindowKey[]) => Object.fromEntries(keys.flatMap((key) => [[`${key}From`, value(form, `${key}From`)], [`${key}To`, value(form, `${key}To`)]]))

/** A labelled start–end time pair; used for housekeeping slots and house rules. */
function TimeWindowRow({ name, label, settings }: { name: WindowKey; label: string; settings: WorkspaceSettings }) {
  return (
    <div className="settings-slot-row">
      <span>{label}</span>
      <input name={`${name}From`} type="time" required defaultValue={settings[`${name}From`]} aria-label={`${label} starts`} />
      <span className="settings-slot-to">to</span>
      <input name={`${name}To`} type="time" required defaultValue={settings[`${name}To`]} aria-label={`${label} ends`} />
    </div>
  )
}

/** Workspace logo: preview plus upload/replace/remove, saved immediately (not with the section's Save). */
function LogoField({ logoVersion, onSave }: { logoVersion: number | null; onSave: (logo: string | null) => SaveResult }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'saved'; text: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function save(logo: string | null) {
    setIsSaving(true)
    const error = await onSave(logo)
    setIsSaving(false)
    setMessage(error ? { tone: 'error', text: error } : { tone: 'saved', text: logo ? 'Logo updated.' : 'Logo removed.' })
  }

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizeLogo(file)
    if ('error' in result) { setMessage({ tone: 'error', text: result.error }); return }
    await save(result.dataUrl)
  }

  return (
    <div className="logo-field">
      <div className="logo-preview">{logoVersion ? <img src={logoUrl(logoVersion)} alt="Workspace logo" /> : <span><Building2 size={22} /></span>}</div>
      <div className="logo-copy">
        <strong>Logo</strong>
        <small>Replaces the raj.pg mark in the sidebar, the resident portal and the sign-in page. PNG with a transparent background works best.</small>
        <div className="logo-actions">
          <button type="button" className="secondary-button" disabled={isSaving} onClick={() => inputRef.current?.click()}><ImageUp size={14} /> {isSaving ? 'Saving…' : logoVersion ? 'Replace logo' : 'Upload logo'}</button>
          {logoVersion && <button type="button" className="icon-button" aria-label="Remove logo" title="Remove logo" disabled={isSaving} onClick={() => { if (window.confirm('Remove the logo and show the raj.pg mark again?')) void save(null) }}><Trash2 size={14} /></button>}
          {message && <span className={`settings-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'saved' && <Check size={13} />}{message.text}</span>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}

/** Settings page: the owner's account, workspace details, rent rules, deposit and notice, house rules, housekeeping, and resident policies. */
export function SettingsView({ admin, settings, onSaveAccount, onSaveSettings, onSaveLogo, onBack }: { admin: SuperAdmin; settings: WorkspaceSettings | null; onSaveAccount: (changes: Record<string, string>) => SaveResult; onSaveSettings: (changes: Partial<WorkspaceSettings>) => SaveResult; onSaveLogo: (logo: string | null) => SaveResult; onBack: () => void }) {
  return (
    <section className="workspace-view settings-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Settings</h2><p>Your account and how the workspace runs.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>

      <div className="settings-grid">
        <SettingsSection icon={<UserRound size={18} />} title="My account" description="Your name and sign-in details. Changing email or password needs your current password." onSubmit={(form) => {
          const changes: Record<string, string> = { name: value(form, 'name'), email: value(form, 'email') }
          if (value(form, 'newPassword')) {
            if (value(form, 'newPassword') !== value(form, 'confirmPassword')) return Promise.resolve('New passwords do not match.')
            changes.newPassword = value(form, 'newPassword')
          }
          if (value(form, 'currentPassword')) changes.currentPassword = value(form, 'currentPassword')
          return onSaveAccount(changes)
        }}>
          <label>Full name<input name="name" required maxLength={60} defaultValue={admin.name} /></label>
          <label>Email address<input name="email" type="email" required defaultValue={admin.email} autoComplete="username" /></label>
          <label>Current password <span>(only to change email or password)</span><input name="currentPassword" type="password" autoComplete="current-password" /></label>
          <div className="settings-pair">
            <label>New password<input name="newPassword" type="password" minLength={10} autoComplete="new-password" placeholder="Leave blank to keep" /></label>
            <label>Confirm new password<input name="confirmPassword" type="password" minLength={10} autoComplete="new-password" /></label>
          </div>
        </SettingsSection>

        {settings ? <>
          <SettingsSection icon={<Building2 size={18} />} title="Workspace details" description="Your business name appears in the sidebar; contact details are shown to residents." onSubmit={(form) => onSaveSettings({ businessName: value(form, 'businessName'), contactPhone: value(form, 'contactPhone'), contactEmail: value(form, 'contactEmail') })}>
            <LogoField logoVersion={settings.logoVersion} onSave={onSaveLogo} />
            <label>Business name<input name="businessName" required maxLength={60} defaultValue={settings.businessName} /></label>
            <div className="settings-pair">
              <label>Contact phone<input name="contactPhone" type="tel" defaultValue={settings.contactPhone ?? ''} placeholder="e.g. +91 98765 43210" /></label>
              <label>Contact email<input name="contactEmail" type="email" defaultValue={settings.contactEmail ?? ''} placeholder="e.g. owner@example.com" /></label>
            </div>
          </SettingsSection>

          <SettingsSection icon={<CalendarClock size={18} />} title="Rent rules" description="When rent is due each month and when the two reminders appear. After the due day, unpaid residents are flagged “access lock due”." onSubmit={(form) => onSaveSettings({ rentDueDay: Number(value(form, 'rentDueDay')), rentReminderOneDay: Number(value(form, 'rentReminderOneDay')), rentReminderTwoDay: Number(value(form, 'rentReminderTwoDay')), lateFee: optionalNumber(form, 'lateFee') ?? 0 })}>
            <div className="settings-trio">
              <label>Reminder 1 on<select name="rentReminderOneDay" defaultValue={settings.rentReminderOneDay}>{dayOptions.map((day) => <option key={day} value={day}>{ordinal(day)}</option>)}</select></label>
              <label>Reminder 2 on<select name="rentReminderTwoDay" defaultValue={settings.rentReminderTwoDay}>{dayOptions.map((day) => <option key={day} value={day}>{ordinal(day)}</option>)}</select></label>
              <label>Rent due by<select name="rentDueDay" defaultValue={settings.rentDueDay}>{dayOptions.map((day) => <option key={day} value={day}>{ordinal(day)}</option>)}</select></label>
            </div>
            <p className="settings-hint">Days go up to the 28th so every month has them. Reminder 1 must come before reminder 2, and reminder 2 no later than the due day.</p>
            <label>Late fee <span>(₹ added to each month paid after the due day; 0 for none)</span><input name="lateFee" type="number" min={0} max={100000} step={1} defaultValue={settings.lateFee} /></label>
          </SettingsSection>

          <SettingsSection icon={<WalletCards size={18} />} title="Deposit and notice" description="Shown to residents in their portal under House rules." onSubmit={(form) => onSaveSettings({ securityDeposit: optionalNumber(form, 'securityDeposit'), noticePeriodDays: optionalNumber(form, 'noticePeriodDays') ?? 0 })}>
            <div className="settings-pair">
              <label>Security deposit <span>(₹; blank to hide)</span><input name="securityDeposit" type="number" min={1} max={1000000} step={1} defaultValue={settings.securityDeposit ?? ''} placeholder="e.g. 10000" /></label>
              <label>Notice to move out <span>(days)</span><input name="noticePeriodDays" type="number" min={0} max={180} step={1} required defaultValue={settings.noticePeriodDays} /></label>
            </div>
          </SettingsSection>

          <SettingsSection icon={<House size={18} />} title="House rules" description="Visiting and quiet hours, shown to residents in their portal." onSubmit={(form) => onSaveSettings(windowFields(form, ['visiting', 'quiet']))}>
            <TimeWindowRow name="visiting" label="Visiting" settings={settings} />
            <TimeWindowRow name="quiet" label="Quiet" settings={settings} />
            <p className="settings-hint">Quiet hours can run past midnight, e.g. 10pm to 7am.</p>
          </SettingsSection>

          <SettingsSection icon={<Sparkles size={18} />} title="Housekeeping hours" description="The time windows residents choose from when requesting a cleaning." onSubmit={(form) => onSaveSettings({ ...windowFields(form, ['morning', 'afternoon', 'evening']), housekeepingWeeklyLimit: optionalNumber(form, 'housekeepingWeeklyLimit') })}>
            {(['morning', 'afternoon', 'evening'] as const).map((slot) => <TimeWindowRow key={slot} name={slot} label={slot[0].toUpperCase() + slot.slice(1)} settings={settings} />)}
            <label>Cleanings per week <span>(per resident, Monday to Sunday; blank for no limit)</span><input name="housekeepingWeeklyLimit" type="number" min={1} max={21} step={1} defaultValue={settings.housekeepingWeeklyLimit ?? ''} placeholder="No limit" /></label>
          </SettingsSection>

          {policySections.map(({ field, title }) => (
            <SettingsSection key={field} wide icon={<FileText size={18} />} title={title} description="Linked at the bottom of every resident's portal. Plain text; each line break is kept." onSubmit={(form) => onSaveSettings({ [field]: value(form, field) })}>
              <label>{title}<textarea name={field} maxLength={5000} rows={12} defaultValue={settings[field]} /></label>
              <p className="settings-hint">This starts as a general PG template, so review it and change anything that does not match your property. Up to 5,000 characters. Clear it and save to hide the link from residents.</p>
            </SettingsSection>
          ))}
        </> : <p className="portal-empty">Loading workspace settings…</p>}
      </div>
    </section>
  )
}
