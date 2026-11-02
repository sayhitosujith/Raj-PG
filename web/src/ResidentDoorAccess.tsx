import { Info, LockKeyhole } from 'lucide-react'
import { DoorKeyLine } from './DoorAccessKey'

/**
 * The resident's Door access card on Home: the doors their PIN opens (the property's locks for residents, or
 * the lock location from Settings → Smart lock when none are listed), their PIN and how to open the door. Without a PIN it says why: rent overdue pauses access (the daily run
 * removes the key), otherwise the reception has not issued one yet. Hidden when door keys are off.
 */
export function ResidentDoorAccess({ enabled, doorAccessKey, doorNames, isRentOverdue, location, instructions, onNotice }: { enabled: boolean; doorAccessKey: string | null | undefined; doorNames: string[]; isRentOverdue: boolean; location: string | null | undefined; instructions: string | null | undefined; onNotice: (message: string) => void }) {
  if (!enabled) return null
  return (
    <section className="workspace-view portal-panel resident-door-access" data-panel="home">
      <div className="workspace-view-heading"><div><p className="eyebrow">Door access</p><h2>{doorNames.length ? doorNames.join(' · ') : location || 'Door lock'}</h2><p>{doorAccessKey ? `Your personal PIN for ${doorNames.length > 1 ? `the ${doorNames.length} doors above` : 'the door'}. Keep it to yourself.` : isRentOverdue ? 'Paused: rent overdue. Pay your rent and ask the reception for a new door key.' : 'No door key yet: ask the reception to issue one.'}</p></div><span className="resident-door-access-icon"><LockKeyhole size={20} /></span></div>
      {doorAccessKey && <div className="resident-door-access-key"><DoorKeyLine doorAccessKey={doorAccessKey} onNotice={onNotice} /></div>}
      {/* Labelled, with no filled box, so the owner's text cannot be mistaken for an input field. */}
      {doorAccessKey && instructions && <div className="resident-door-access-steps"><strong><Info size={13} /> How to open</strong><p>{instructions}</p></div>}
    </section>
  )
}
