import { useState } from 'react'
import { Check, KeyRound, LockKeyhole, RotateCw } from 'lucide-react'
import type { DoorLockTask } from './doorLocks'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function TaskRow({ task, onDone }: { task: DoorLockTask; onDone?: () => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false)
  const isAdd = task.action === 'ADD'
  return (
    <article className={`door-lock-task${task.doneAt ? ' is-done' : ''}`}>
      <span className={`door-lock-action ${isAdd ? 'is-add' : 'is-delete'}`}>{isAdd ? 'Add PIN' : 'Delete PIN'}</span>
      <code className="door-lock-pin">{task.pin}</code>
      <div className="door-lock-text">
        <strong>{task.residentName}{task.propertyName ? ` · ${task.propertyName}` : ''}</strong>
        <small>{task.reason} · {shortDate(task.createdAt)}{task.doneAt ? ` · done ${shortDate(task.doneAt)}${task.doneByName ? ` by ${task.doneByName}` : ''}` : ''}</small>
      </div>
      {onDone && <button type="button" className="primary-button" disabled={isSaving} onClick={() => { setIsSaving(true); void onDone().finally(() => setIsSaving(false)) }}><Check size={14} /> {isSaving ? 'Saving…' : 'Done on lock'}</button>}
    </article>
  )
}

/**
 * The Door locks page: PIN changes the owner must make by hand on the lock (it has no API the app can
 * reach), oldest first, each confirmed with "Done on lock"; recently done ones are listed below.
 */
export function DoorLocksView({ tasks, hasError, onRetry, onDone, onBack }: { tasks: { pending: DoorLockTask[]; done: DoorLockTask[] } | null; hasError: boolean; onRetry: () => void; onDone: (task: DoorLockTask) => Promise<void>; onBack: () => void }) {
  return (
    <section className="workspace-view door-locks-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Door locks</h2><p>PIN changes to make on the lock in the Qubo app, oldest first. Mark each one done once it is on the lock.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to overview</button></div></div>
      {hasError && !tasks && <div className="workspace-empty"><div className="workspace-empty-icon"><RotateCw size={22} /></div><h3>Door lock tasks could not be loaded</h3><p>Check your connection and try again.</p><button className="primary-button" onClick={onRetry}>Try again</button></div>}
      {tasks && (tasks.pending.length
        ? <div className="door-lock-list">{tasks.pending.map((task) => <TaskRow key={task.id} task={task} onDone={() => onDone(task)} />)}</div>
        : <div className="workspace-empty"><div className="workspace-empty-icon"><LockKeyhole size={22} /></div><h3>The lock is up to date</h3><p>Issuing, replacing or removing a resident's door access key adds a task here.</p></div>)}
      {tasks && tasks.done.length > 0 && <>
        <h3 className="door-lock-done-title"><KeyRound size={14} /> Recently done</h3>
        <div className="door-lock-list">{tasks.done.map((task) => <TaskRow key={task.id} task={task} />)}</div>
      </>}
    </section>
  )
}
