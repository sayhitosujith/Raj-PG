import type { Prisma } from '@prisma/client'

/** A bed request that cannot be met: not a bed in the room, or already someone's. */
export class BedUnavailableError extends Error {}

/**
 * A bed number from a request body: a whole number from 1, null or absent (or blank) for "pick one for
 * me", or the message to show. Whether it exists in the room is checked when the bed is claimed.
 */
export function parseBedNumber(value: unknown): { bed: number | null } | { error: string } {
  if (value === undefined || value === null || value === '') return { bed: null }
  const bed = typeof value === 'string' ? Number(value) : value
  if (typeof bed !== 'number' || !Number.isInteger(bed) || bed < 1) return { error: 'Bed number must be a whole number from 1.' }
  return { bed }
}

/**
 * The bed a resident takes in a room: the one asked for when it exists and is free, otherwise the lowest
 * free bed. Call it inside the transaction that saves the resident, after the room is locked (claimRoom
 * does, or lockRoom below), so two residents saved together cannot be given the same bed; the unique
 * (roomId, bedNumber) index is the last line of defence. `residentId` leaves the resident's own current
 * bed out of "taken", for an edit that keeps or changes their bed in the same room.
 */
export async function claimBed(transaction: Prisma.TransactionClient, room: { id: string; number: string; beds: number }, requested: number | null, residentId?: string) {
  const others = await transaction.resident.findMany({ where: { roomId: room.id, bedNumber: { not: null }, ...(residentId ? { id: { not: residentId } } : {}) }, select: { bedNumber: true } })
  const taken = new Set(others.map((resident) => resident.bedNumber))
  if (requested !== null) {
    if (requested > room.beds) throw new BedUnavailableError(`Room ${room.number} has ${room.beds} ${room.beds === 1 ? 'bed' : 'beds'}, so there is no bed ${requested}.`)
    if (taken.has(requested)) throw new BedUnavailableError(`Bed ${requested} in room ${room.number} is already taken. Choose another bed, or leave it blank for the next free one.`)
    return requested
  }
  for (let bed = 1; bed <= room.beds; bed += 1) if (!taken.has(bed)) return bed
  throw new BedUnavailableError(`Every bed in room ${room.number} is taken.`)
}

/** Locks a room's row for the rest of the transaction, so its beds cannot change under a bed choice. */
export async function lockRoom(transaction: Prisma.TransactionClient, roomId: string) {
  await transaction.$queryRaw`SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE`
}
