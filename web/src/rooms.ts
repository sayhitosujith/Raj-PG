/** One of a property's owner-defined rooms: how many beds it has and who lives in it (empty when free). */
export type Room = { id: string; number: string; beds: number; residentNames: string[]; /** Bed numbers in use, so only free beds are offered. */ bookedBeds: number[] }

/** The most residents one room can hold; the backend enforces the same limit. */
export const maxBeds = 10

/** Beds still free in a room. */
export const freeBeds = (room: Room) => Math.max(0, room.beds - room.residentNames.length)

/** "Single", "2 sharing", "3 sharing"…, for bed-count pickers. */
export const sharingLabel = (beds: number) => beds === 1 ? 'Single' : `${beds} sharing`
export type PropertyRooms = { totalRooms: number | null; rooms: Room[] }

/** The rooms of one property, sorted as people read them (101, 102, … 110). */
export async function fetchRooms(propertyId: string) {
  const response = await fetch(`/api/properties/${propertyId}/rooms`)
  if (!response.ok) throw new Error('rooms failed')
  return await response.json() as PropertyRooms
}
