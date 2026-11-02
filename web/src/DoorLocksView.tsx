import { useState } from 'react'
import { Check, DoorClosed, KeyRound, LockKeyhole, RotateCw } from 'lucide-react'
import type { DoorLockTask } from './doorLocks'
import { DoorLockSetup } from './DoorLockSetup'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

// The server words lock changes as "Lock added: Back Door"; inside that door's own card the name is noise.
const reasonText = (reason: string) => reason.replace(/^Lock (added|changed|removed): .*$/, (_match, verb: string) => (verb === 'added' ? 'New lock' : verb === 'changed' ? 'Lock settings changed' : 'Lock removed'))

function TaskRow({ task, onDone }: { task: DoorLockTask; onDone?: () => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false)
  const isAdd = task.action === 'ADD'
  return (
    <article className={`door-lock-task${task.doneAt ? ' is-done' : ''}`}>
      <span className={`door-lock-action ${isAdd ? 'is-add' : 'is-delete'}`}>{isAdd ? 'Add' : 'Delete'}</span>
      <code className="door-lock-pin">{task.pin}</code>
      <div className="door-lock-text">
        <strong>for {task.holderName} <span className="resident-badge">{task.holderKind === 'STAFF' ? 'Staff' : 'Resident'}</span></strong>
        <small>{reasonText(task.reason)} · {shortDate(task.createdAt)}{task.doneAt ? ` · done ${shortDate(task.doneAt)}${task.doneByName ? ` by ${task.doneByName}` : ''}` : ''}</small>
      </div>
      {onDone && <button type="button" className="primary-button" disabled={isSaving} onClick={() => { setIsSaving(true); void onDone().finally(() => setIsSaving(false)) }}><Check size={14} /> {isSaving ? 'Saving…' : 'Done'}</button>}
    </article>
  )
}

type DoorGroup = { key: string; title: string; tasks: DoorLockTask[] }

// One card per physical lock, since the changes are made standing at (or in the app of) one lock at a time.
function groupByDoor(tasks: DoorLockTask[], unnamedLock: string): DoorGroup[] {
  const groups = new Map<string, DoorGroup>()
  for (const task of tasks) {
    const key = task.lockId ?? `unnamed:${task.propertyName ?? ''}`
    const title = [task.lockName ?? unnamedLock, task.propertyName].filter(Boolean).join(' · ')
    const group = groups.get(key) ?? { key, title, tasks: [] }
    group.tasks.push(task)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/**
 * The Door locks page: the PIN changes to make by hand on each lock (they have no API the app can reach),
 * grouped by door and oldest first, each confirmed with Done; then each property's locks, and what was done lately.
 */
export function DoorLocksView({ lock, properties, tasks, hasError, onRetry, onDone, onNotice, onBack }: { /** From Settings → Smart lock: names the lock of a property with none listed. */ lock: { model: string | null; location: string | null } | null; properties: Array<{ id: string; name: string }>; tasks: { pending: DoorLockTask[]; done: DoorLockTask[] } | null; hasError: boolean; onRetry: () => void; onDone: (task: DoorLockTask) => Promise<void>; onNotice: (message: string) => void; onBack: () => void }) {
  const unnamedLock = lock?.location || 'Door lock'
  const doors = tasks ? groupByDoor(tasks.pending, unnamedLock) : []
  return (
    <section className="workspace-view door-locks-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Door locks</h2><p>The app cannot reach the locks, so PINs are added and deleted by hand in {lock?.model || 'the lock'}'s own app.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>
      {hasError && !tasks && <div className="workspace-empty"><div className="workspace-empty-icon"><RotateCw size={22} /></div><h3>Door lock tasks could not be loaded</h3><p>Check your connection and try again.</p><button className="primary-button" onClick={onRetry}>Try again</button></div>}
      {tasks && (doors.length
        ? <>
            <ol className="door-lock-steps">
              <li>Open the lock's app and pick the door named on the card.</li>
              <li><b>Add</b> or <b>Delete</b> each PIN shown, exactly as written.</li>
              <li>Tap <b>Done</b> on each one, only once it is changed on the lock.</li>
            </ol>
            {doors.map((door) => (
              <section key={door.key} className="door-lock-door" aria-label={door.title}>
                <h3><DoorClosed size={15} /> {door.title} <span>{door.tasks.length} {door.tasks.length === 1 ? 'change' : 'changes'}</span></h3>
                <div className="door-lock-list">{door.tasks.map((task) => <TaskRow key={task.id} task={task} onDone={() => onDone(task)} />)}</div>
              </section>
            ))}
          </>
        : <div className="workspace-empty"><div className="workspace-empty-icon"><LockKeyhole size={22} /></div><h3>All locks are up to date</h3><p>Issuing, replacing or removing a resident's or staff member's door PIN adds the changes here, for each door it opens.</p></div>)}
      <DoorLockSetup properties={properties} onChanged={onRetry} onNotice={onNotice} />
      {tasks && tasks.done.length > 0 && <details className="door-lock-done">
        <summary className="door-lock-done-title"><KeyRound size={14} /> Recently done ({tasks.done.length})</summary>
        <div className="door-lock-list">{tasks.done.map((task) => <TaskRow key={task.id} task={{ ...task, reason: `${task.lockName ?? unnamedLock} · ${reasonText(task.reason)}` }} />)}</div>
      </details>}
    </section>
  )
}
