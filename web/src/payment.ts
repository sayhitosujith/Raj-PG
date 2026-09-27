/** Payment types and statuses; the keys must match the backend's lists in payments.ts. */
export const paymentMethodLabels = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank transfer', cheque: 'Cheque', card: 'Card' } as const
export const paymentStatusLabels = { paid: 'Paid', pending: 'Pending', failed: 'Failed' } as const

export type PaymentMethod = keyof typeof paymentMethodLabels
export type PaymentStatus = keyof typeof paymentStatusLabels

/** A payment the owner recorded by hand, as returned by /api/payments. Amount is whole rupees. */
export type Payment = {
  id: string
  amount: number
  status: PaymentStatus
  method: PaymentMethod
  payerName: string
  phone: string
  bankName: string
  propertyId: string
  property: string
  residentId: string | null
  // Set when collected through a Razorpay UPI QR code.
  razorpayQrId: string | null
  // The resident's UPI reference (UTR) when they reported paying the owner's UPI ID.
  reference: string
  // Rent months a resident's report covers; empty when they had no rent set up.
  rentMonths: Array<{ month: string; amount: number }> | null
  qrImageUrl: string | null
  qrExpiresAt: string | null
  createdAt: string
}

/** The editable fields of a payment, as the form holds them. */
export type PaymentDraft = Omit<Payment, 'id' | 'property' | 'createdAt' | 'amount' | 'razorpayQrId' | 'reference' | 'rentMonths' | 'qrImageUrl' | 'qrExpiresAt'> & { amount: string }

export { formatRupees } from './rent'
