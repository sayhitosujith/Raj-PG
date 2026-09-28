import { useState } from 'react'
import { WhatsAppIcon } from './WhatsAppIcon'
import { readApiError } from './superAdmin'

/** The resident's switch for WhatsApp updates (rent reminders, receipts, notices); on by default. */
export function WhatsAppPreference({ optIn, onChanged, onNotice }: { optIn: boolean; onChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [isSaving, setIsSaving] = useState(false)

  async function toggle() {
    setIsSaving(true)
    const response = await fetch('/api/resident-portal/whatsapp', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optIn: !optIn }) }).catch(() => null)
    setIsSaving(false)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'Your preference could not be saved.') : 'Could not reach the server.'); return }
    onNotice(optIn ? 'WhatsApp updates turned off.' : 'WhatsApp updates turned on.')
    await onChanged()
  }

  return (
    <div className="whatsapp-preference">
      <span className="whatsapp-preference-icon"><WhatsAppIcon size={18} /></span>
      <div><strong>WhatsApp updates</strong><small>Rent reminders, payment receipts and notices from your property owner.</small></div>
      <button type="button" role="switch" aria-checked={optIn} className={`switch${optIn ? ' is-on' : ''}`} disabled={isSaving} onClick={toggle}><span className="sr-only">WhatsApp updates</span></button>
    </div>
  )
}
