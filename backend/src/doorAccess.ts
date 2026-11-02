import { DoorLockAction, type Prisma } from '@prisma/client'
import { createDoorAccessKey } from './credentials.js'

/**
 * Which PIN belongs on which door lock, and the to-do list that gets it there. The locks (Qubo) have no API
 * the app can reach, so PINs are added and deleted by hand from the Door locks page. A property's locks
 * (DoorLock) each say whether residents, staff or both get a PIN on them; a property with none set up has one
 * unnamed lock for residents, as before locks could be listed.
 *
 * Rather than each change queuing its own tasks, {@link syncDoorAccess} compares what should be on every lock
 * (the holder's current PIN, on the locks meant for them) with what the task history says is there, and queues
 * only the difference. So issuing, replacing, removing, moving out, a lock added or a lock's audience changed
 * all come out right, on every lock, from the one rule.
 */

type Db = Prisma.TransactionClient

/** Whose PIN: a resident, or a member of the property staff (a Worker). */
export type HolderRef = { residentId: string } | { workerId: string }

type Holder = { kind: 'RESIDENT' | 'STAFF'; name: string; pin: string | null; property: { id: string; name: string } | null }
type LockRef = { id: string | null; name: string | null }

// Map key for a lock; '' is the unnamed lock of a property with none set up.
const keyOf = (lockId: string | null) => lockId ?? ''

async function loadHolder(db: Db, ref: HolderRef): Promise<Holder | null> {
  if ('residentId' in ref) {
    const resident = await db.resident.findUnique({ where: { id: ref.residentId }, select: { name: true, doorAccessKey: true, room: { select: { property: { select: { id: true, name: true } } } } } })
    return resident && { kind: 'RESIDENT', name: resident.name, pin: resident.doorAccessKey, property: resident.room?.property ?? null }
  }
  const worker = await db.worker.findUnique({ where: { id: ref.workerId }, select: { name: true, doorAccessKey: true, property: { select: { id: true, name: true } } } })
  return worker && { kind: 'STAFF', name: worker.name, pin: worker.doorAccessKey, property: worker.property }
}

/** The locks a holder's PIN belongs on: their property's locks meant for them, or its unnamed lock (residents only). */
async function locksFor(db: Db, holder: Holder): Promise<LockRef[]> {
  if (!holder.property) return []
  const locks = await db.doorLock.findMany({ where: { propertyId: holder.property.id, removedAt: null }, select: { id: true, name: true, forResidents: true, forStaff: true } })
  if (!locks.length) return holder.kind === 'RESIDENT' ? [{ id: null, name: null }] : []
  return locks.filter((lock) => (holder.kind === 'RESIDENT' ? lock.forResidents : lock.forStaff))
}

/**
 * Queues whatever lock changes make the holder's PIN be on exactly the locks meant for them. Call it after
 * saving the change (a new or cleared PIN, a move, a lock edited), in the same transaction. A PIN whose "add"
 * is still pending never reached the lock, so that task is cancelled rather than asking for a delete.
 */
export async function syncDoorAccess(db: Db, ref: HolderRef, reason: string) {
  const holder = await loadHolder(db, ref)
  const holderWhere = 'residentId' in ref ? { residentId: ref.residentId } : { workerId: ref.workerId }
  const history = await db.doorLockTask.findMany({ where: { ...holderWhere, OR: [{ lockId: null }, { lock: { removedAt: null } }] }, orderBy: { createdAt: 'asc' }, select: { id: true, action: true, pin: true, lockId: true, lockName: true, holderName: true, holderKind: true, propertyId: true, propertyName: true, doneAt: true } })

  // What the task history leaves on each lock, pending tasks included, since they are what the lock is about to hold.
  const onLock = new Map<string, (typeof history)[number]>()
  for (const task of history) {
    if (task.action === DoorLockAction.ADD) onLock.set(keyOf(task.lockId), task)
    else onLock.delete(keyOf(task.lockId))
  }
  const wanted = new Map((holder?.pin ? await locksFor(db, holder) : []).map((lock) => [keyOf(lock.id), lock]))

  for (const key of new Set([...onLock.keys(), ...wanted.keys()])) {
    const present = onLock.get(key)
    const lock = wanted.get(key)
    const wantedPin = lock ? holder?.pin ?? null : null
    if (present?.pin === wantedPin) continue
    if (present) {
      if (!present.doneAt) await db.doorLockTask.delete({ where: { id: present.id } })
      // The holder may be gone (deleted staff), so the names come from the task that put the PIN there.
      else await db.doorLockTask.create({ data: { action: DoorLockAction.DELETE, pin: present.pin, lockId: present.lockId, lockName: present.lockName, holderKind: present.holderKind, ...holderWhere, holderName: holder?.name ?? present.holderName, propertyId: present.propertyId, propertyName: present.propertyName, reason } })
    }
    if (wantedPin && lock && holder) {
      await db.doorLockTask.create({ data: { action: DoorLockAction.ADD, pin: wantedPin, lockId: lock.id, lockName: lock.name, holderKind: holder.kind, ...holderWhere, holderName: holder.name, propertyId: holder.property?.id ?? null, propertyName: holder.property?.name ?? null, reason } })
    }
  }
}

/** Syncs every PIN holder at a property, after one of its locks was added, changed or removed. */
export async function syncPropertyDoorAccess(db: Db, propertyId: string, reason: string) {
  const [residents, workers] = await Promise.all([
    db.resident.findMany({ where: { room: { propertyId }, doorAccessKey: { not: null } }, select: { id: true } }),
    db.worker.findMany({ where: { propertyId, doorAccessKey: { not: null } }, select: { id: true } }),
  ])
  for (const { id } of residents) await syncDoorAccess(db, { residentId: id }, reason)
  for (const { id } of workers) await syncDoorAccess(db, { workerId: id }, reason)
}

// Generous: at 6 digits a clash is about one in a million per holder, so this only matters for 4-digit PINs.
const pinAttempts = 50

/**
 * A new PIN that no resident or staff member holds, since two people cannot share a PIN on a shared lock.
 * Throws when none is found, which only happens when short PINs are nearly used up.
 */
export async function createUniqueDoorPin(db: Db, digits: number) {
  for (let attempt = 0; attempt < pinAttempts; attempt += 1) {
    const pin = createDoorAccessKey(digits)
    const [residents, workers] = await Promise.all([db.resident.count({ where: { doorAccessKey: pin } }), db.worker.count({ where: { doorAccessKey: pin } })])
    if (!residents && !workers) return pin
  }
  throw new Error('No unused door PIN could be found; increase the PIN length in Settings → Smart lock.')
}
