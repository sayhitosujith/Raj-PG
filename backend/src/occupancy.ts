import type { Prisma } from '@prisma/client'

/** What each room must load for bed counts: its size and how many residents are in it. */
export const roomBedsSelect = { beds: true, _count: { select: { residents: true } } } satisfies Prisma.RoomSelect

type RoomBeds = Prisma.RoomGetPayload<{ select: typeof roomBedsSelect }>

/**
 * Beds taken and in total for one property. Rooms the owner declared ("Number of rooms") but has not
 * set up yet count as single rooms, so occupancy reads sensibly before every room is defined.
 */
export function bedCounts(property: { totalRooms: number | null; rooms: RoomBeds[] }) {
  const definedBeds = property.rooms.reduce((sum, room) => sum + room.beds, 0)
  const undefinedRooms = Math.max(0, (property.totalRooms ?? property.rooms.length) - property.rooms.length)
  const taken = property.rooms.reduce((sum, room) => sum + room._count.residents, 0)
  return { taken, total: definedBeds + undefinedRooms }
}
