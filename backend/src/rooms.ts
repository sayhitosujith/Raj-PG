import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from './db.js'

/**
 * A property's rooms, defined by the owner (e.g. 101-110, 201-210, G1), each with a number of beds
 * (1 = single, 2 = double sharing…). Residents can only be placed in a room that exists and has a free
 * bed, so the resident form offers a list instead of free text. The list never exceeds the property's
 * declared number of rooms.
 */
const roomNumberPattern = /^[A-Za-z0-9-]{1,12}$/
const maxRoomsPerRequest = 200
const maxBeds = 10

/** A bed count from a request: a whole number from 1 to maxBeds, or null when it is not one. */
const parseBeds = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maxBeds ? value : null
const bedsError = `Beds must be a whole number from 1 to ${maxBeds}.`

/** Orders room numbers the way people read them: 2 before 10, 101 before 110, then letters. */
const compareRoomNumbers = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

async function listRooms(propertyId: string) {
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { totalRooms: true, rooms: { select: { id: true, number: true, beds: true, residents: { select: { name: true }, orderBy: { name: 'asc' } } } } } })
  const rooms = property.rooms.map((room) => ({ id: room.id, number: room.number, beds: room.beds, residentNames: room.residents.map((resident) => resident.name) })).sort((a, b) => compareRoomNumbers(a.number, b.number))
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

// Adds room numbers (a single room, or a generated range sent as a list), all with the same number of
// beds (1 when not given). Existing numbers are skipped, so re-running a range only fills the gaps.
roomsAdminRouter.post('/properties/:id/rooms', async (request, response) => {
  const { id } = request.params as { id: string }
  const { numbers, beds: rawBeds = 1 } = request.body as { numbers?: unknown; beds?: unknown }
  if (!Array.isArray(numbers) || !numbers.length) { response.status(400).json({ error: 'Enter at least one room number.' }); return }
  const beds = parseBeds(rawBeds)
  if (beds === null) { response.status(400).json({ error: bedsError }); return }
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
    if (fresh.length) await prisma.room.createMany({ data: fresh.map((number) => ({ propertyId: id, number, beds })), skipDuplicates: true })
    response.status(201).json({ ...await listRooms(id), added: fresh.length, skipped: cleaned.length - fresh.length })
  } catch (error) {
    respondToError(response, error, 'Rooms could not be added.')
  }
})

// Changes how many residents a room holds. It cannot go below the residents already in it.
roomsAdminRouter.patch('/properties/:id/rooms/:roomId', async (request, response) => {
  const { id, roomId } = request.params as { id: string; roomId: string }
  const beds = parseBeds((request.body as { beds?: unknown }).beds)
  if (beds === null) { response.status(400).json({ error: bedsError }); return }
  try {
    const room = await prisma.room.findFirst({ where: { id: roomId, propertyId: id }, select: { number: true, _count: { select: { residents: true } } } })
    if (!room) { response.status(404).json({ error: 'Room was not found.' }); return }
    const living = room._count.residents
    if (beds < living) { response.status(409).json({ error: `${living} residents live in room ${room.number}, so it needs at least ${living} beds. Move someone first.` }); return }
    await prisma.room.update({ where: { id: roomId }, data: { beds } })
    response.json(await listRooms(id))
  } catch (error) {
    respondToError(response, error, 'The room could not be updated.')
  }
})

// Only empty rooms can be removed; move or remove the residents first.
roomsAdminRouter.delete('/properties/:id/rooms/:roomId', async (request, response) => {
  const { id, roomId } = request.params as { id: string; roomId: string }
  try {
    const removed = await prisma.room.deleteMany({ where: { id: roomId, propertyId: id, residents: { none: {} } } })
    if (!removed.count) {
      const exists = await prisma.room.count({ where: { id: roomId, propertyId: id } })
      response.status(exists ? 409 : 404).json({ error: exists ? 'Someone lives in this room. Move or remove the residents first.' : 'Room was not found.' })
      return
    }
    response.json(await listRooms(id))
  } catch (error) {
    respondToError(response, error, 'The room could not be removed.')
  }
})
