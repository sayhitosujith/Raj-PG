import { DoorLockSetup } from './DoorLockSetup'

/**
 * The Door locks page under Device management: only the lock devices, each property's locks and who uses them.
 * The PIN changes those devices need are on the Lock tasks page; `onLocksChanged` reloads them after an edit here.
 */
export function DoorLocksView({ lock, properties, onLocksChanged, onNotice, onBack }: { /** From Settings → Smart lock: the lock model, for the description. */ lock: { model: string | null } | null; properties: Array<{ id: string; name: string }>; onLocksChanged: () => void; onNotice: (message: string) => void; onBack: () => void }) {
  return (
    <section className="workspace-view door-locks-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Device management</p><h2>Door locks</h2><p>The {lock?.model || 'smart lock'} devices at each property, and whether residents, staff or both get a PIN on them.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div></div>
      <DoorLockSetup properties={properties} onChanged={onLocksChanged} onNotice={onNotice} />
    </section>
  )
}
