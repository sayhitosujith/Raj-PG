/** One of a property's owner-defined rooms; residentName is null when the room is free. */
export type Room = { id: string; number: string; residentName: string | null }
export type PropertyRooms = { totalRooms: number | null; rooms: Room[] }

/** The rooms of one property, sorted as people read them (101, 102, … 110). */
export async function fetchRooms(propertyId: string) {
  const response = await fetch(`/api/properties/${propertyId}/rooms`)
  if (!response.ok) throw new Error('rooms failed')
  return await response.json() as PropertyRooms
}
