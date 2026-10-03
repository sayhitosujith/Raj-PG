/** Owner-editable workspace settings, as returned by GET /api/settings. */
export type WorkspaceSettings = {
  businessName: string
  /** null when no logo is uploaded; otherwise a version for the logo URL. */
  logoVersion: number | null
  contactPhone: string | null
  contactEmail: string | null
  /** The owner's own UPI ID shown to residents with rent due; payments to it are confirmed by hand. */
  upiId: string | null
  /** The name shown in the resident's UPI app; falls back to the business name. */
  upiPayeeName: string | null
  /** null when no QR image is uploaded; otherwise a version for its URL. */
  upiQrVersion: number | null
  rentDueDay: number
  rentReminderOneDay: number
  rentReminderTwoDay: number
  rentReminderThreeDay: number
  /** Whole rupees added to each month paid after the due day; 0 = none. */
  lateFee: number
  securityDeposit: number | null
  noticePeriodDays: number
  /** The owner's own house rules (one per line) and FAQs (question, answer; blank line between). */
  extraHouseRules: string
  faqs: string
  /** Per-day rates for the move-out month, in whole rupees. */
  dailyRateWithFood: number
  dailyRateWithoutFood: number
  visitingFrom: string
  visitingTo: string
  /** Quiet hours may run past midnight, so quietFrom can be later than quietTo. */
  quietFrom: string
  quietTo: string
  /** Cleanings a resident may book per Monday–Sunday week; null = no limit. */
  housekeepingWeeklyLimit: number | null
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

/** House rules as the resident portal shows them; hours are preformatted, e.g. "10pm – 7am". */
export type HouseRules = { visitingHours: string; quietHours: string; noticePeriodDays: number; securityDeposit: number | null }

/** What a resident needs from the workspace: contacts, house rules, housekeeping slots and limit, and the policies. */
/** How residents pay the owner directly: a UPI ID, an uploaded QR image (by version), or both. */
export type UpiPayee = { id: string | null; payeeName: string; qrVersion: number | null }
export type ResidentWorkspace = { businessName: string; contactPhone: string | null; contactEmail: string | null; upi: UpiPayee | null; slots: SlotOption[]; housekeepingWeeklyLimit: number | null; houseRules: HouseRules; termsAndConditions: string; privacyPolicy: string }
