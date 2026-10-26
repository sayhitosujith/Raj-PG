import { findDocumentProblem } from './identityDocuments.js'

/**
 * Occupations and the student ID card. Occupation is a choice of these (web/src/occupations.ts lists the
 * same) or, for "Other", the resident's own words. A Student must have their college or school ID card on
 * file; it is stored as a data URL like the Aadhaar card, and cleared once they are no longer a student.
 */
export const occupationChoices = ['Student', 'Working professional', 'Business'] as const

/** Whether an occupation is the Student choice (case and spacing aside). */
export const isStudent = (occupation: string | null | undefined) => occupation?.trim().toLowerCase() === 'student'

/** The student ID card sent in a body: none (absent or blank keeps what is on file), the card, or why it is unacceptable. */
export function parseStudentIdCard(value: unknown): { card?: string } | { error: string } {
  if (value === undefined || value === null || value === '') return {}
  if (typeof value !== 'string') return { error: 'Student ID card must be a JPG, PNG, or PDF.' }
  const problem = findDocumentProblem(value, 'Student ID card')
  return problem ? { error: problem } : { card: value }
}

/**
 * What to store for the student ID card once `occupation` is saved: the new card, nothing new (one is
 * already on file), or null when they are not a student. Errors when a student would have no card.
 */
export function studentIdCardWrite(occupation: string, card: string | undefined, hasCardOnFile: boolean): { data: { studentIdCardUrl?: string | null } } | { error: string } {
  if (!isStudent(occupation)) return { data: { studentIdCardUrl: null } }
  if (card) return { data: { studentIdCardUrl: card } }
  if (!hasCardOnFile) return { error: 'Upload the student ID card (a photo or PDF of the college or school ID).' }
  return { data: {} }
}
