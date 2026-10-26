/** Occupations the forms offer; anything else is "Other", typed in full (backend/src/studentId.ts lists the same). */
export const occupationChoices = ['Student', 'Working professional', 'Business'] as const
export type OccupationChoice = (typeof occupationChoices)[number] | 'Other'

/** Whether an occupation is the Student choice (case and spacing aside), which needs a student ID card. */
export const isStudent = (occupation: string | null | undefined) => occupation?.trim().toLowerCase() === 'student'

/** A saved occupation as the form's choice plus, for Other, its text; blank when none is saved yet. */
export function splitOccupation(saved: string | null | undefined): { choice: OccupationChoice | ''; other: string } {
  const value = saved?.trim() ?? ''
  if (!value) return { choice: '', other: '' }
  const choice = occupationChoices.find((item) => item.toLowerCase() === value.toLowerCase())
  return choice ? { choice, other: '' } : { choice: 'Other', other: value }
}
