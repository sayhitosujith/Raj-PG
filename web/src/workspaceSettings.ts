/** Owner-editable workspace settings, as returned by GET /api/settings. */
export type WorkspaceSettings = {
  businessName: string
  /** null when no logo is uploaded; otherwise a version for the logo URL. */
  logoVersion: number | null
  contactPhone: string | null
  contactEmail: string | null
  rentDueDay: number
  rentReminderOneDay: number
  rentReminderTwoDay: number
  morningFrom: string
  morningTo: string
  afternoonFrom: string
  afternoonTo: string
  eveningFrom: string
  eveningTo: string
  /** Plain-text resident policies, linked from the resident portal; empty hides the link. */
  termsAndConditions: string
  privacyPolicy: string
}

/** Used until settings load (and for the sidebar before sign-in data arrives); matches server defaults. */
export const defaultBusinessName = 'Raj Properties'

/** A housekeeping slot as the resident's form shows it, with hours from Settings. */
export type SlotOption = { value: 'MORNING' | 'AFTERNOON' | 'EVENING'; label: string; hours: string }

/** What a resident needs from the workspace: who to contact, the housekeeping hours, and the policies. */
export type ResidentWorkspace = { businessName: string; contactPhone: string | null; contactEmail: string | null; slots: SlotOption[]; termsAndConditions: string; privacyPolicy: string }
