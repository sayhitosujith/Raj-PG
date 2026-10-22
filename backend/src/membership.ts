import { prisma } from './db.js'

/**
 * Residents' membership IDs, shown on their Home card: the PG's initials, the year they joined and
 * their running member number, e.g. "PS-2026-0001". The number comes from the database
 * (Resident.memberNumber), so IDs are unique; the ID is saved the first time it is shown so that a
 * later rename or move never changes it.
 */

// Words that say what kind of business it is rather than which one, so they are left out of the initials.
const fillerWords = new Set(['pvt', 'ltd', 'private', 'limited', 'llp', 'the'])

/** "Premium Stay Pvt Ltd" → "PS": the first letter of each word, at most three; "PG" when the name gives none. */
export function propertyInitials(name: string) {
  const letters = name.split(/[^A-Za-z0-9]+/).filter((word) => word && !fillerWords.has(word.toLowerCase())).map((word) => word[0].toUpperCase())
  return letters.slice(0, 3).join('') || 'PG'
}

/** "PS-2026-0001"; the number grows past four digits rather than wrapping. */
export const formatMembershipId = (initials: string, year: number, memberNumber: number) => `${initials}-${year}-${String(memberNumber).padStart(4, '0')}`

/** The resident's membership ID, made and saved the first time it is needed. */
export async function ensureMembershipId(resident: { id: string; membershipId: string | null; memberNumber: number; joinedAt: Date }, propertyName: string) {
  if (resident.membershipId) return resident.membershipId
  // joinedAt is a date-only column, stored as midnight UTC, so its UTC year is the joining year.
  const membershipId = formatMembershipId(propertyInitials(propertyName), resident.joinedAt.getUTCFullYear(), resident.memberNumber)
  // Two portal loads at once would both write the same value, so a plain update is safe.
  await prisma.resident.update({ where: { id: resident.id }, data: { membershipId } })
  return membershipId
}
