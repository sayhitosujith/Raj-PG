import { useState, type ReactNode } from 'react'
import { Mail } from 'lucide-react'
import { readApiError } from './superAdmin'
import { FeatureRibbon, FeatureTag, useFeatureBadge, type FeatureKey } from './FeatureBadges'
import { WhatsAppIcon } from './WhatsAppIcon'

type Channel = 'whatsappOptIn' | 'emailOptIn'

/** One on/off row; saving goes through the parent so both rows share one request shape. */
function PreferenceRow({ feature, icon, iconClass, title, detail, isOn, isSaving, onToggle }: { feature: FeatureKey; icon: ReactNode; iconClass: string; title: string; detail: string; isOn: boolean; isSaving: boolean; onToggle: () => void }) {
  // The owner's banner for this channel (Beta by default); "New" goes once the switch is used.
  const { ribbon, tag, markSeen } = useFeatureBadge(feature)
  return (
    <div className={`whatsapp-preference${ribbon ? ' has-ribbon' : ''}`}>
      {ribbon && <FeatureRibbon badge={ribbon} />}
      <span className={`whatsapp-preference-icon ${iconClass}`}>{icon}</span>
      <div><strong>{title}{tag && <FeatureTag badge={tag} />}</strong><small>{detail}</small></div>
      <button type="button" role="switch" aria-checked={isOn} className={`switch${isOn ? ' is-on' : ''}`} disabled={isSaving} onClick={() => { markSeen(); onToggle() }}><span className="sr-only">{title}</span></button>
    </div>
  )
}

/**
 * The resident's switches for WhatsApp and email updates (rent reminders, notices), both on by
 * default. Payment receipts are always emailed, since they are records, so the email row says so. A
 * channel switched off in Settings loses its row, and the card goes when both are off.
 */
export function NotificationPreferences({ whatsappOptIn, emailOptIn, hasEmail, showWhatsApp = true, showEmail = true, onChanged, onNotice }: { whatsappOptIn: boolean; emailOptIn: boolean; hasEmail: boolean; /** False while that channel is switched off in Settings > Resident features. */ showWhatsApp?: boolean; showEmail?: boolean; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [saving, setSaving] = useState<Channel | null>(null)

  async function toggle(channel: Channel, next: boolean, label: string) {
    setSaving(channel)
    const response = await fetch('/api/resident-portal/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [channel]: next }) }).catch(() => null)
    setSaving(null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Your preference could not be saved.') : 'Could not reach the server.'); return }
    onNotice(`${label} updates turned ${next ? 'on' : 'off'}.`)
    await onChanged()
  }

  if (!showWhatsApp && !showEmail) return null
  return (
    <div className="notification-preferences">
      {showWhatsApp && <PreferenceRow feature="whatsapp" icon={<WhatsAppIcon size={18} />} iconClass="" title="WhatsApp updates" detail="Rent reminders, payment receipts and notices from your property owner." isOn={whatsappOptIn} isSaving={saving === 'whatsappOptIn'} onToggle={() => void toggle('whatsappOptIn', !whatsappOptIn, 'WhatsApp')} />}
      {showEmail && <PreferenceRow feature="email" icon={<Mail size={17} />} iconClass="is-email" title="Email updates" detail={hasEmail ? 'Rent reminders and notices by email. Payment receipts are always emailed.' : 'Ask your property owner to add your email address to get these.'} isOn={emailOptIn} isSaving={saving === 'emailOptIn'} onToggle={() => void toggle('emailOptIn', !emailOptIn, 'Email')} />}
    </div>
  )
}
