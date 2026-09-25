import type { RentSummary } from './rent'

/** Where a resident is in Aadhaar verification; only VERIFIED unlocks the resident portal. */
export type AadharStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

/** A resident as returned by the residents API; never carries the access key or card file. */
export type Resident = { rent: RentSummary; photoVersion: number | null; aadharStatus: AadharStatus; aadharRejectionReason?: string | null; aadharSubmittedAt?: string | null; aadharReviewedAt?: string | null; id: string; name: string; phone?: string | null; email?: string | null; aadharNumber?: string | null; permanentAddress?: string | null; hasAadharCard: boolean; hasPassword: boolean; active: boolean; createdAt: string; joinedAt: string; room: string; propertyId: string; property: string; location: string }
