import { useEffect, useState } from 'react'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'

/** A PIN change to make on the physical door lock by hand; mirrors the API's DoorLockTask. */
export type DoorLockTask = { id: string; action: 'ADD' | 'DELETE'; pin: string; residentName: string; propertyName: string | null; reason: string; createdAt: string; doneAt: string | null; doneByName: string | null }

type DoorLockTasks = { pending: DoorLockTask[]; done: DoorLockTask[] }

/**
 * The owner's door lock to-do list, loaded once the role is known and on each workspace refresh.
 * Lives in App rather than the page so the sidebar badge can show the pending count everywhere.
 */
export function useDoorLockTasks(refreshSignal: number, enabled: boolean) {
  const [tasks, setTasks] = useState<DoorLockTasks | null>(null)
  const [hasError, setHasError] = useState(false)

  const load = () => {
    if (!enabled) return
    void fetch('/api/door-lock-tasks')
      .then((response) => response.ok ? response.json() as Promise<DoorLockTasks> : Promise.reject(new Error('failed')))
      .then((list) => { setTasks(list); setHasError(false) }, () => setHasError(true))
  }
  useEffect(() => { load() }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- reload when the role is known
  useRefreshSignal(refreshSignal, load)

  /** Confirms a task was done on the lock; resolves to an error message, or null on success. */
  async function markDone(task: DoorLockTask) {
    const response = await fetch(`/api/door-lock-tasks/${task.id}/done`, { method: 'POST' }).catch(() => null)
    // A 409 means someone else already marked it, so reload to show the current list either way.
    if (!response?.ok) { load(); return response ? await readApiError(response, 'Could not mark it done.') : 'Could not reach the server.' }
    const done = await response.json() as DoorLockTask
    setTasks((current) => current && { pending: current.pending.filter((item) => item.id !== task.id), done: [done, ...current.done] })
    return null
  }

  return { tasks: enabled ? tasks : null, hasError, reload: load, markDone }
}
