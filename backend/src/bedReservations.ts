import { Prisma } from '@prisma/client'
import { Router } from 'express'
import type { AuthContext } from './auth.js'
import { lockRoom } from './beds.js'
import { prisma } from './db.js'

/**
 * Bed reservations: staff hold free beds back (for someone expected, say) by selecting them on the
 * Overview's room grid, and release them by hand. A held bed is neither offered in the resident form nor
 * given to a new resident (beds.ts and claimRoom skip it). Under /properties/:id, so staffGuard keeps
 * receptionists to their own property; super admins and receptionists may both reserve and release.
 */
export const bedReservationsRouter = Router()

const maxBedsPerRequest = 100
/** A reservation that cannot be made as asked (a room not in the property, a bed taken or missing). */
class ReservationError extends Error {}
const maxNoteLength = 120

type BedChoice = { roomNumber: string; bed: number }

/** The beds asked for, de-duplicated, or the message to show. */
function parseBeds(value: unknown): { beds: BedChoice[] } | { error: string } {
  if (!Array.isArray(value) || !value.length) return { error: 'Choose at least one free bed to reserve.' }
  if (value.length > maxBedsPerRequest) return { error: `Reserve up to ${maxBedsPerRequest} beds at a time.` }
  const beds = new Map<string, BedChoice>()
  for (const item of value as Array<{ roomNumber?: unknown; bed?: unknown }>) {
    if (typeof item?.roomNumber !== 'string' || !item.roomNumber || typeof item.bed !== 'number' || !Number.isInteger(item.bed) || item.bed < 1) return { error: 'Each bed needs a room number and a bed number.' }
    beds.set(`${item.roomNumber}#${item.bed}`, { roomNumber: item.roomNumber, bed: item.bed })
  }
  return { beds: [...beds.values()] }
}

// Reserves several free beds at once: { beds: [{ roomNumber: '107', bed: 3 }, …], note?: 'For Ravi' }. All or none.
bedReservationsRouter.post('/properties/:id/bed-reservations', async (request, response) => {
  const { beds: rawBeds, note: rawNote } = request.body as { beds?: unknown; note?: unknown }
  const parsed = parseBeds(rawBeds)
  if ('error' in parsed) { response.status(400).json({ error: parsed.error }); return }
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') { response.status(400).json({ error: 'The note must be text.' }); return }
  const note = rawNote?.trim() || null
  if (note && note.length > maxNoteLength) { response.status(400).json({ error: `Keep the note under ${maxNoteLength} characters.` }); return }
  const propertyId = request.params.id
  const { userId } = response.locals.auth as AuthContext
  try {
    const staff = await prisma.superAdmin.findUnique({ where: { id: userId }, select: { name: true } })
    const count = await prisma.$transaction(async (transaction) => {
      const roomNumbers = [...new Set(parsed.beds.map((choice) => choice.roomNumber))]
      const rooms = await transaction.room.findMany({ where: { propertyId, number: { in: roomNumbers } }, select: { id: true, number: true, beds: true } })
      const roomByNumber = new Map(rooms.map((room) => [room.number, room]))
      const missing = roomNumbers.find((number) => !roomByNumber.has(number))
      if (missing) throw new ReservationError(`Room ${missing} is not in this property.`)
      // Locked in a fixed order, so two staff reserving overlapping rooms cannot deadlock or both win.
      for (const room of [...rooms].sort((a, b) => a.id.localeCompare(b.id))) await lockRoom(transaction, room.id)
      const occupants = await transaction.resident.findMany({ where: { roomId: { in: rooms.map((room) => room.id) }, bedNumber: { not: null } }, select: { roomId: true, bedNumber: true } })
      const occupied = new Set(occupants.map((occupant) => `${occupant.roomId}#${occupant.bedNumber}`))
      const rows = parsed.beds.map((choice) => {
        const room = roomByNumber.get(choice.roomNumber)!
        if (choice.bed > room.beds) throw new ReservationError(`Room ${room.number} has no bed ${choice.bed}.`)
        if (occupied.has(`${room.id}#${choice.bed}`)) throw new ReservationError(`Bed ${choice.bed} in room ${room.number} is taken by a resident.`)
        return { roomId: room.id, bedNumber: choice.bed, note, reservedByName: staff?.name ?? null }
      })
      await transaction.bedReservation.createMany({ data: rows })
      return rows.length
    })
    response.status(201).json({ reserved: count })
  } catch (error) {
    if (error instanceof ReservationError) { response.status(409).json({ error: error.message }); return }
    // The (roomId, bedNumber) unique index: one of the beds was already reserved.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { response.status(409).json({ error: 'One of those beds is already reserved. Refresh and choose again.' }); return }
    console.error('Bed reservation failed:', error)
    response.status(503).json({ error: 'The beds could not be reserved.' })
  }
})

// Releases one reservation, so the bed is free again.
bedReservationsRouter.delete('/properties/:id/bed-reservations/:reservationId', async (request, response) => {
  try {
    const { count } = await prisma.bedReservation.deleteMany({ where: { id: request.params.reservationId, room: { propertyId: request.params.id } } })
    if (!count) { response.status(404).json({ error: 'That reservation was already released.' }); return }
    response.status(204).end()
  } catch (error) {
    console.error('Releasing a reservation failed:', error)
    response.status(503).json({ error: 'The reservation could not be released.' })
  }
})

