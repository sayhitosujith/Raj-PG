import { useRef, useState, type ReactNode } from 'react'
import { Building2, CalendarClock, Check, FileText, Hand, House, ImageUp, LockKeyhole, QrCode, Palette, Shirt, Sparkles, SunMoon, Tag, ToggleRight, Trash2, UserRound, WalletCards } from 'lucide-react'
import { logoUrl } from './branding'
import { ListFormattingTextarea } from './ListFormattingTextarea'
import { resizeLogo, resizeUpiQr } from './imageResize'
import { WhatsAppSettings } from './WhatsAppSettings'
import { EmailSettings } from './EmailSettings'
import { ordinal } from './rent'
import { readIdentityFields, type SuperAdmin } from './superAdmin'
import { SuperAdminIdentityFields } from './SuperAdminIdentityFields'
import type { ResidentTheme, WorkspaceSettings } from './workspaceSettings'
import { InlineLoader } from './Loader'
import { PortalColourFields } from './PortalColourFields'
import { featureBadgeFeatures, featureBadgeLabels, type FeatureBadgeKind } from './FeatureBadges'
import { isFeatureOn, residentFeatures } from './residentFeatures'

type SaveResult = Promise<string | null>
/** Image settings saved through PUT/DELETE /api/settings/<kind>. */
export type SettingImage = 'logo' | 'upi-qr'
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
    // The id lets the sidebar's workspace menu jump straight to a section (see WorkspaceMenu).
    <form id={`settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className={`settings-section${wide ? ' wide' : ''}`} onSubmit={submit}>
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

type ImageFieldProps = {
  /** What the image is, lower case, as used in button labels ("logo", "UPI QR"). */
  noun: string
  title: string
  hint: string
  previewUrl: string | null
  emptyIcon: ReactNode
  removeQuestion: string
  resize: (file: File) => Promise<{ dataUrl: string } | { error: string }>
  /** A portrait preview, for images such as QR posters that are taller than wide. */
  tall?: boolean
  onSave: (image: string | null) => SaveResult
}

/** An image setting (logo, UPI QR): preview plus upload/replace/remove, saved immediately (not with the section's Save). */
function ImageField({ noun, title, hint, previewUrl, emptyIcon, removeQuestion, resize, tall = false, onSave }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'saved'; text: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const label = `${noun[0].toUpperCase()}${noun.slice(1)}`

  async function save(image: string | null) {
    setIsSaving(true)
    const error = await onSave(image)
    setIsSaving(false)
    setMessage(error ? { tone: 'error', text: error } : { tone: 'saved', text: image ? `${label} updated.` : `${label} removed.` })
  }

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resize(file)
    if ('error' in result) { setMessage({ tone: 'error', text: result.error }); return }
    await save(result.dataUrl)
  }

  return (
    <div className={`logo-field${tall ? ' is-tall' : ''}`}>
      <div className="logo-preview">{previewUrl ? <img src={previewUrl} alt={title} /> : <span>{emptyIcon}</span>}</div>
      <div className="logo-copy">
        <strong>{title}</strong>
        <small>{hint}</small>
        <div className="logo-actions">
          <button type="button" className="secondary-button" disabled={isSaving} onClick={() => inputRef.current?.click()}><ImageUp size={14} /> {isSaving ? 'Saving…' : previewUrl ? `Replace ${noun}` : `Upload ${noun}`}</button>
          {previewUrl && <button type="button" className="icon-button" aria-label={`Remove ${noun}`} title={`Remove ${noun}`} disabled={isSaving} onClick={() => { if (window.confirm(removeQuestion)) void save(null) }}><Trash2 size={14} /></button>}
          {message && <span className={`settings-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'saved' && <Check size={13} />}{message.text}</span>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}

/** Settings page: the owner's account, workspace details, rent rules, deposit and notice, house rules, housekeeping, and resident policies. */
export function SettingsView({ page = 'settings', admin, settings, onSaveAccount, onSaveSettings, onSaveImage, onNotice, onBack }: { /** Which page: Settings (account, workspace and rules), Views (colours, banners, light/dark), or just the account (receptionists). */ page?: 'settings' | 'views' | 'account'; admin: SuperAdmin; settings: WorkspaceSettings | null; onSaveAccount: (changes: Record<string, string>) => SaveResult; onSaveSettings: (changes: Partial<WorkspaceSettings>) => SaveResult; onSaveImage: (kind: SettingImage, image: string | null) => SaveResult; onNotice: (message: string) => void; onBack: () => void }) {
  return (
    <section className="workspace-view settings-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>{page === 'views' ? 'Views' : 'Settings'}</h2><p>{page === 'views' ? 'How the app looks: colours, feature banners and the light or dark view, for residents and these admin pages.' : page === 'account' ? 'Your name, sign-in and identity details.' : 'Your account and how the workspace runs.'}</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div></div>

      <div className="settings-grid">
        {(page === 'settings' || page === 'account') && (
        <SettingsSection icon={<UserRound size={18} />} title="My account" description="Your name, sign-in and identity details. Changing email or password needs your current password." onSubmit={(form) => {
          const changes: Record<string, string> = { name: value(form, 'name'), email: value(form, 'email'), ...readIdentityFields(form) }
          if (value(form, 'newPassword')) {
            if (value(form, 'newPassword') !== value(form, 'confirmPassword')) return Promise.resolve('New passwords do not match.')
            changes.newPassword = value(form, 'newPassword')
          }
          if (value(form, 'currentPassword')) changes.currentPassword = value(form, 'currentPassword')
          return onSaveAccount(changes)
        }}>
          <label>Full name<input name="name" required maxLength={60} defaultValue={admin.name} /></label>
          <label>Email address<input name="email" type="email" required defaultValue={admin.email} autoComplete="username" /></label>
          <SuperAdminIdentityFields admin={admin} />
          <label>Current password <span>(only to change email or password)</span><input name="currentPassword" type="password" autoComplete="current-password" /></label>
          <div className="settings-pair">
            <label>New password<input name="newPassword" type="password" minLength={10} autoComplete="new-password" placeholder="Leave blank to keep" /></label>
            <label>Confirm new password<input name="confirmPassword" type="password" minLength={10} autoComplete="new-password" /></label>
          </div>
        </SettingsSection>
        )}

        {settings ? <>
          {page === 'settings' && <>
          <SettingsSection icon={<Building2 size={18} />} title="Workspace details" description="Your business name appears in the sidebar; contact details are shown to residents." onSubmit={(form) => onSaveSettings({ businessName: value(form, 'businessName'), contactPhone: value(form, 'contactPhone'), contactEmail: value(form, 'contactEmail') })}>
            <ImageField noun="logo" title="Logo" hint="Replaces the raj.pg mark in the sidebar, the resident portal and the sign-in page. PNG with a transparent background works best." previewUrl={settings.logoVersion ? logoUrl(settings.logoVersion) : null} emptyIcon={<Building2 size={22} />} removeQuestion="Remove the logo and show the raj.pg mark again?" resize={resizeLogo} onSave={(image) => onSaveImage('logo', image)} />
            <label>Business name<input name="businessName" required maxLength={60} defaultValue={settings.businessName} /></label>
            <div className="settings-pair">
              <label>Contact phone<input name="contactPhone" type="tel" defaultValue={settings.contactPhone ?? ''} placeholder="e.g. +91 98765 43210" /></label>
              <label>Contact email<input name="contactEmail" type="email" defaultValue={settings.contactEmail ?? ''} placeholder="e.g. owner@example.com" /></label>
            </div>
          </SettingsSection>

          <SettingsSection icon={<QrCode size={18} />} title="UPI payments" description="Residents see your UPI ID and a QR code in their portal: your uploaded QR if you add one, otherwise one generated from the UPI ID. Money goes straight to your bank, so residents report the payment with its UPI reference and you confirm it under Payments." onSubmit={(form) => onSaveSettings({ upiId: value(form, 'upiId'), upiPayeeName: value(form, 'upiPayeeName') })}>
            <ImageField noun="UPI QR" tall title="Your UPI QR" hint="Upload the QR from PhonePe, GPay, Paytm or your bank (a screenshot or photo works). Residents see it instead of the generated QR; it has no amount built in, so they type it themselves." previewUrl={settings.upiQrVersion ? `/api/settings/upi-qr?v=${settings.upiQrVersion}` : null} emptyIcon={<QrCode size={22} />} removeQuestion="Remove your QR image? Residents will see the QR generated from your UPI ID instead (if one is set)." resize={resizeUpiQr} onSave={(image) => onSaveImage('upi-qr', image)} />
            <div className="settings-pair">
              <label>UPI ID <span>(blank to hide)</span><input name="upiId" defaultValue={settings.upiId ?? ''} placeholder="e.g. rajpg@okhdfcbank" autoCapitalize="none" spellCheck={false} /></label>
              <label>Payee name <span>(shown in UPI apps)</span><input name="upiPayeeName" maxLength={50} defaultValue={settings.upiPayeeName ?? ''} placeholder={settings.businessName} /></label>
            </div>
          </SettingsSection>
          <SettingsSection icon={<LockKeyhole size={18} />} title="Smart lock" description="Your door lock and its PINs. The app cannot control the lock itself: each PIN to add or delete is listed under Door locks, for you to do in the lock's own app." onSubmit={(form) => onSaveSettings({ doorKeysEnabled: form.get('doorKeysEnabled') === 'on', lockModel: value(form, 'lockModel'), lockLocation: value(form, 'lockLocation'), doorPinLength: Number(value(form, 'doorPinLength')), doorUnlockInstructions: value(form, 'doorUnlockInstructions') })}>
            <label className="whatsapp-optin"><input type="checkbox" name="doorKeysEnabled" defaultChecked={settings.doorKeysEnabled} /><span>Door access keys <small className="settings-hint">Off hides them on the Residents page, in the resident portal and under Door locks. Remove every resident's key first.</small></span></label>
            <div className="settings-pair">
              <label>Lock model <span>(optional)</span><input name="lockModel" maxLength={60} defaultValue={settings.lockModel ?? ''} placeholder="e.g. Qubo Select SDL-P3" /></label>
              <label>Fitted at <span>(optional)</span><input name="lockLocation" maxLength={60} defaultValue={settings.lockLocation ?? ''} placeholder="e.g. Main gate" /></label>
            </div>
            <label>PIN length <span>(digits in new PINs; existing PINs keep theirs)</span><input name="doorPinLength" type="number" min={4} max={8} required defaultValue={settings.doorPinLength} /></label>
            <label>How to open the door <span>(shown to residents with their PIN)</span><textarea name="doorUnlockInstructions" rows={3} maxLength={500} defaultValue={settings.doorUnlockInstructions ?? ''} placeholder="e.g. Touch the keypad to wake it, enter your PIN, then press ✓." /></label>
          </SettingsSection>
          </>}

          {page === 'views' && <>
          <SettingsSection icon={<Palette size={18} />} title="Resident & Super Admin portal colors" description="The colour of buttons, cards, the Home card and the tab bar in every resident's portal and in these admin pages, the text on those buttons, the general text, input placeholders, error messages, the New, Coming soon and Beta banners, the app background, and the card backgrounds." onSubmit={(form) => onSaveSettings({ portalThemeColor: value(form, 'portalThemeColor') || null, portalButtonTextColor: value(form, 'portalButtonTextColor') || null, portalErrorColor: value(form, 'portalErrorColor') || null, portalTextColor: value(form, 'portalTextColor') || null, portalPlaceholderColor: value(form, 'portalPlaceholderColor') || null, portalNewBadgeColor: value(form, 'portalNewBadgeColor') || null, portalSoonBadgeColor: value(form, 'portalSoonBadgeColor') || null, portalBetaBadgeColor: value(form, 'portalBetaBadgeColor') || null, portalBackgroundColor: value(form, 'portalBackgroundColor') || null, portalCardColor: value(form, 'portalCardColor') || null, portalChildCardColor: value(form, 'portalChildCardColor') || null })}>
            <PortalColourFields theme={settings.portalThemeColor} text={settings.portalButtonTextColor} error={settings.portalErrorColor} ink={settings.portalTextColor} placeholder={settings.portalPlaceholderColor} newBadge={settings.portalNewBadgeColor} soonBadge={settings.portalSoonBadgeColor} betaBadge={settings.portalBetaBadgeColor} background={settings.portalBackgroundColor} card={settings.portalCardColor} childCard={settings.portalChildCardColor} />
          </SettingsSection>

          <SettingsSection icon={<Tag size={18} />} title="Feature banners" description="Mark resident features as New, Coming soon or Beta with a banner on their card. New disappears for each resident once they use that feature." onSubmit={(form) => onSaveSettings({ featureBadges: Object.fromEntries(featureBadgeFeatures.map(({ key }) => [key, value(form, `badge-${key}`) || 'NONE'])) as WorkspaceSettings['featureBadges'] })}>
            <div className="feature-badge-fields">
              {featureBadgeFeatures.map(({ key, label }) => (
                <label key={key}>{label}<select name={`badge-${key}`} defaultValue={settings.featureBadges?.[key] ?? ''}>
                  <option value="">None</option>
                  {(Object.keys(featureBadgeLabels) as FeatureBadgeKind[]).map((kind) => <option key={kind} value={kind}>{featureBadgeLabels[kind].setting}</option>)}
                </select></label>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection icon={<SunMoon size={18} />} title="Resident view" description="Light or dark view for every resident's portal. Residents cannot change it themselves." onSubmit={(form) => onSaveSettings({ residentTheme: value(form, 'residentTheme') as ResidentTheme })}>
            <label>View<select name="residentTheme" defaultValue={settings.residentTheme}>
              <option value="AUTO">Auto: light from 7am, dark from 7pm</option>
              <option value="LIGHT">Always light</option>
              <option value="DARK">Always dark</option>
            </select></label>
          </SettingsSection>
          </>}

          {page === 'settings' && <>
          <WhatsAppSettings onNotice={onNotice} />
          <EmailSettings onNotice={onNotice} />

          <SettingsSection icon={<ToggleRight size={18} />} title="Resident features" description="Switch features off for every resident. A switched-off feature disappears from the portal and its requests are refused; anything already saved is kept for when you switch it back on." onSubmit={(form) => { const doorAccess = form.get('feature-doorAccess') === 'on'; return onSaveSettings({ residentFeatures: Object.fromEntries(residentFeatures.map(({ key }) => [key, form.get(`feature-${key}`) === 'on'])), ...(doorAccess !== settings.doorKeysEnabled ? { doorKeysEnabled: doorAccess } : {}) }) }}>
            <div className="resident-feature-fields">
              {residentFeatures.map(({ key, label, detail }) => (
                <label key={key}><input type="checkbox" name={`feature-${key}`} defaultChecked={isFeatureOn(settings.residentFeatures, key)} /><span>{label}<small>{detail}</small></span></label>
              ))}
              {/* For PGs without smart locks. It is the Smart lock section's door keys switch, not a second one, so the
                  server still refuses to turn it off while a PIN is live on a lock. It is only sent when changed, so
                  saving the other switches never runs into that refusal unless Door access was unticked too. */}
              <label><input type="checkbox" name="feature-doorAccess" defaultChecked={settings.doorKeysEnabled} /><span>Door access<small>Door PINs, for staff and residents (same as Smart lock). Remove every PIN before switching off.</small></span></label>
            </div>
            <p className="settings-hint">Deleting an account always stays available to residents, who have a right to ask for their data to be erased.</p>
          </SettingsSection>

          <SettingsSection icon={<CalendarClock size={18} />} title="Rent rules" description="When rent is due each month and when the three reminders appear. After the due day, unpaid residents are locked out of the app until you record the payment." onSubmit={(form) => onSaveSettings({ rentDueDay: Number(value(form, 'rentDueDay')), rentReminderOneDay: Number(value(form, 'rentReminderOneDay')), rentReminderTwoDay: Number(value(form, 'rentReminderTwoDay')), rentReminderThreeDay: Number(value(form, 'rentReminderThreeDay')), lateFee: optionalNumber(form, 'lateFee') ?? 0 })}>
            <div className="settings-trio settings-quad">
              <label>Reminder 1 on<select name="rentReminderOneDay" defaultValue={settings.rentReminderOneDay}>{dayOptions.map((day) => <option key={day} value={day}>{ordinal(day)}</option>)}</select></label>
              <label>Reminder 2 on<select name="rentReminderTwoDay" defaultValue={settings.rentReminderTwoDay}>{dayOptions.map((day) => <option key={day} value={day}>{ordinal(day)}</option>)}</select></label>
              <label>Reminder 3 on<select name="rentReminderThreeDay" defaultValue={settings.rentReminderThreeDay}>{dayOptions.map((day) => <option key={day} value={day}>{ordinal(day)}</option>)}</select></label>
              <label>Rent due by<select name="rentDueDay" defaultValue={settings.rentDueDay}>{dayOptions.map((day) => <option key={day} value={day}>{ordinal(day)}</option>)}</select></label>
            </div>
            <p className="settings-hint">Days go up to the 28th so every month has them. Reminders go in order on different days (1, then 2, then 3), with reminder 3 no later than the due day; the third shows the resident a countdown to the lock.</p>
            <label>Late fee <span>(₹ added to each month paid after the due day; 0 for none)</span><input name="lateFee" type="number" min={0} max={100000} step={1} defaultValue={settings.lateFee} /></label>
          </SettingsSection>

          <SettingsSection icon={<WalletCards size={18} />} title="Deposit and notice" description="Shown to residents in their portal under House rules." onSubmit={(form) => onSaveSettings({ securityDeposit: optionalNumber(form, 'securityDeposit'), noticePeriodDays: optionalNumber(form, 'noticePeriodDays') ?? 0, dailyRateWithFood: optionalNumber(form, 'dailyRateWithFood') ?? 0, dailyRateWithoutFood: optionalNumber(form, 'dailyRateWithoutFood') ?? 0 })}>
            <div className="settings-pair">
              <label>Security deposit <span>(₹; blank to hide)</span><input name="securityDeposit" type="number" min={1} max={1000000} step={1} defaultValue={settings.securityDeposit ?? ''} placeholder="e.g. 10000" /></label>
              <label>Notice to move out <span>(days)</span><input name="noticePeriodDays" type="number" min={0} max={180} step={1} required defaultValue={settings.noticePeriodDays} /></label>
            </div>
            <div className="settings-pair">
              <label>Per-day rate with food <span>(₹)</span><input name="dailyRateWithFood" type="number" min={1} max={100000} step={1} required defaultValue={settings.dailyRateWithFood} /></label>
              <label>Per-day rate without food <span>(₹)</span><input name="dailyRateWithoutFood" type="number" min={1} max={100000} step={1} required defaultValue={settings.dailyRateWithoutFood} /></label>
            </div>
            <p className="settings-hint">For the month a resident moves out: days stayed from the 1st (move-out day included) × their rate, never more than that month's rent. The unused part of a paid month is refunded with the deposit.</p>
          </SettingsSection>

          <SettingsSection icon={<House size={18} />} title="House rules" description="Visiting and quiet hours, shown to residents in their portal." onSubmit={(form) => onSaveSettings({ ...windowFields(form, ['visiting', 'quiet']), extraHouseRules: value(form, 'extraHouseRules') })}>
            <TimeWindowRow name="visiting" label="Visiting" settings={settings} />
            <TimeWindowRow name="quiet" label="Quiet" settings={settings} />
            <p className="settings-hint">Quiet hours can run past midnight, e.g. 10pm to 7am.</p>
            <label>More rules <span>(one per line, shown to residents as a list)</span><textarea name="extraHouseRules" rows={5} maxLength={3000} defaultValue={settings.extraHouseRules} placeholder={'Gate closes at 11 pm\nNo smoking inside rooms\nGuests must sign in at reception'} /></label>
          </SettingsSection>

          <SettingsSection icon={<FileText size={18} />} title="FAQs" description="Common questions, answered for residents under Info." onSubmit={(form) => onSaveSettings({ faqs: value(form, 'faqs') })}>
            <label>Questions and answers<textarea name="faqs" rows={8} maxLength={6000} defaultValue={settings.faqs} placeholder={'How do I pay rent?\nScan the UPI QR in your portal, then tap "I\'ve paid".\n\nWhat if I lose my key?\nTell the warden; a replacement costs ₹200.'} /></label>
            <p className="settings-hint">Write the question on one line and the answer below it. Leave a blank line between questions.</p>
          </SettingsSection>

          <SettingsSection icon={<Sparkles size={18} />} title="Housekeeping hours" description="The time windows residents choose from when requesting a cleaning." onSubmit={(form) => onSaveSettings({ ...windowFields(form, ['morning', 'afternoon', 'evening']), housekeepingWeeklyLimit: optionalNumber(form, 'housekeepingWeeklyLimit') })}>
            {(['morning', 'afternoon', 'evening'] as const).map((slot) => <TimeWindowRow key={slot} name={slot} label={slot[0].toUpperCase() + slot.slice(1)} settings={settings} />)}
            <label>Cleanings per week <span>(per resident, Monday to Sunday; blank for no limit)</span><input name="housekeepingWeeklyLimit" type="number" min={1} max={21} step={1} defaultValue={settings.housekeepingWeeklyLimit ?? ''} placeholder="No limit" /></label>
          </SettingsSection>

          <SettingsSection icon={<Shirt size={18} />} title="Laundry shop" description="The laundry shop residents can use, shown on the Help tab of their portal. Leave everything blank to hide it." onSubmit={(form) => onSaveSettings({ laundryShopName: value(form, 'laundryShopName'), laundryShopUrl: value(form, 'laundryShopUrl'), laundryShopHours: value(form, 'laundryShopHours') })}>
            <label>Shop name <span>(optional)</span><input name="laundryShopName" maxLength={60} defaultValue={settings.laundryShopName ?? ''} placeholder="e.g. QuickWash Laundry" /></label>
            <label>Website or booking link <span>(optional)</span><input name="laundryShopUrl" type="url" maxLength={300} defaultValue={settings.laundryShopUrl ?? ''} placeholder="https://quickwash.in" /></label>
            <label>Timings <span>(optional)</span><input name="laundryShopHours" maxLength={120} defaultValue={settings.laundryShopHours ?? ''} placeholder="e.g. Mon–Sat 8 am – 8 pm, Sunday closed" /></label>
          </SettingsSection>

          <SettingsSection icon={<Hand size={18} />} title="Late meal requests" description="Residents can ask for a meal after the 11:59 pm cutoff, until it starts; reception or a super admin approves it on the Kitchen page." onSubmit={(form) => onSaveSettings({ lateMealLimit: Number(value(form, 'lateMealLimit')) })}>
            <label>Approvals per meal <span>(per property, e.g. Tuesday dinner; the kitchen cooks for at most this many extras)</span><input name="lateMealLimit" type="number" min={1} max={100} step={1} required defaultValue={settings.lateMealLimit} /></label>
          </SettingsSection>

          {policySections.map(({ field, title }) => (
            <SettingsSection key={field} wide icon={<FileText size={18} />} title={title} description="Linked at the bottom of every resident's portal. Plain text; each line break is kept." onSubmit={(form) => onSaveSettings({ [field]: value(form, field) })}>
              <ListFormattingTextarea name={field} label={title} maxLength={5000} rows={12} defaultValue={settings[field]} />
              <p className="settings-hint">This starts as a general PG template, so review it and change anything that does not match your property. Up to 5,000 characters. Clear it and save to hide the link from residents.</p>
            </SettingsSection>
          ))}
          </>}
        </> : <InlineLoader label="Loading workspace settings…" />}
      </div>
    </section>
  )
}
