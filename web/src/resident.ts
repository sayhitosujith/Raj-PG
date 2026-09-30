import type { RentSummary } from './rent'

/** Where a resident is in ID verification (Aadhaar, or passport and visa); only VERIFIED unlocks the resident portal. */
export type AadharStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

/** A resident as returned by the residents API; never carries the access key or card file. */
export type Resident = { rent: RentSummary; photoVersion: number | null; aadharStatus: AadharStatus; aadharRejectionReason?: string | null; aadharSubmittedAt?: string | null; aadharReviewedAt?: string | null; id: string; name: string; phone?: string | null; email?: string | null; nationality: string; aadharNumber?: string | null; passportNumber?: string | null; passportExpiry?: string | null; visaNumber?: string | null; visaType?: string | null; visaExpiry?: string | null; permanentAddress?: string | null; hasAadharCard: boolean; hasPassportScan: boolean; hasPassword: boolean; foodOpted: boolean; whatsappOptIn: boolean; emailOptIn: boolean; foodRequestedAt?: string | null; rentFromProperty: boolean; active: boolean; createdAt: string; joinedAt: string; room: string; propertyId: string; property: string; location: string }
