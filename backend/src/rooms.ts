import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from './db.js'

/**
 * A property's rooms, defined by the owner (e.g. 101-110, 201-210, G1). Residents can only be
 * placed in a room that exists and is free, so the resident form offers a list instead of free
 * text. The list never exceeds the property's declared number of rooms.
 */
const roomNumberPattern = /^[A-Za-z0-9-]{1,12}$/
const maxRoomsPerRequest = 200

/** Orders room numbers the way people read them: 2 before 10, 101 before 110, then letters. */
const compareRoomNumbers = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

async function listRooms(propertyId: string) {
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { totalRooms: true, rooms: { select: { id: true, number: true, resident: { select: { name: true } } } } } })
  const rooms = property.rooms.map((room) => ({ id: room.id, number: room.number, residentName: room.resident?.name ?? null })).sort((a, b) => compareRoomNumbers(a.number, b.number))
  return { totalRooms: property.totalRooms, rooms }
}

function respondToError(response: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ error: 'Property was not found.' }); return }
  console.error(fallback, error)
  response.status(503).json({ error: fallback })
}

/** Owner routes for a property's rooms; must be mounted behind the super admin guard. */
export const roomsAdminRouter = Router()

roomsAdminRouter.get('/properties/:id/rooms', async (request, response) => {
  try {
    response.json(await listRooms((request.params as { id: string }).id))
  } catch (error) {
    respondToError(response, error, 'Rooms could not be loaded.')
  }
})

// Adds room numbers (a single room, or a generated range sent as a list). Existing numbers are
// skipped, so re-running a range only fills the gaps.
roomsAdminRouter.post('/properties/:id/rooms', async (request, response) => {
  const { id } = request.params as { id: string }
  const { numbers } = request.body as { numbers?: unknown }
  if (!Array.isArray(numbers) || !numbers.length) { response.status(400).json({ error: 'Enter at least one room number.' }); return }
  if (numbers.length > maxRoomsPerRequest) { response.status(400).json({ error: `Add up to ${maxRoomsPerRequest} rooms at a time.` }); return }
  const cleaned = [...new Set(numbers.map((number) => (typeof number === 'string' ? number.trim() : '')))]
  const invalid = cleaned.find((number) => !roomNumberPattern.test(number))
  if (invalid !== undefined) { response.status(400).json({ error: `"${invalid || '(blank)'}" is not a valid room number. Use letters, digits and dashes, up to 12 characters.` }); return }
  try {
    const current = await listRooms(id)
    const existing = new Set(current.rooms.map((room) => room.number.toLowerCase()))
    const fresh = cleaned.filter((number) => !existing.has(number.toLowerCase()))
    if (current.totalRooms !== null && current.rooms.length + fresh.length > current.totalRooms) {
      response.status(400).json({ error: `This property is set to ${current.totalRooms} rooms and already has ${current.rooms.length}, so only ${Math.max(current.totalRooms - current.rooms.length, 0)} more can be added. Raise "Number of rooms" in Edit property first.` })
      return
    }
    if (fresh.length) await prisma.room.createMany({ data: fresh.map((number) => ({ propertyId: id, number })), skipDuplicates: true })
    response.status(201).json({ ...await listRooms(id), added: fresh.length, skipped: cleaned.length - fresh.length })
  } catch (error) {
    respondToError(response, error, 'Rooms could not be added.')
  }
})

// Only free rooms can be removed; move or remove the resident first.
roomsAdminRouter.delete('/properties/:id/rooms/:roomId', async (request, response) => {
  const { id, roomId } = request.params as { id: string; roomId: string }
  try {
    const removed = await prisma.room.deleteMany({ where: { id: roomId, propertyId: id, resident: { is: null } } })
    if (!removed.count) {
      const exists = await prisma.room.count({ where: { id: roomId, propertyId: id } })
      response.status(exists ? 409 : 404).json({ error: exists ? 'Someone lives in this room. Move or remove the resident first.' : 'Room was not found.' })
      return
    }
    response.json(await listRooms(id))
  } catch (error) {
    respondToError(response, error, 'The room could not be removed.')
  }
})
