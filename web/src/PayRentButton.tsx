import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { formatRupees, type RentSummary } from './rent'
import { readApiError } from './superAdmin'

// The parts of Razorpay Checkout this app uses (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type CheckoutOptions = { key: string; amount: number; currency: string; order_id: string; name: string; description: string; prefill: Record<string, string | undefined>; theme: { color: string }; handler: (response: CheckoutResponse) => void; modal: { ondismiss: () => void } }
type RazorpayCheckout = new (options: CheckoutOptions) => { open: () => void; on: (event: 'payment.failed', handler: (response: { error: { description?: string } }) => void) => void }
declare global { interface Window { Razorpay?: RazorpayCheckout } }

type Order = { keyId: string; orderId: string; amount: number; currency: string; months: string[]; prefill: Record<string, string | undefined> }

let checkoutScript: Promise<void> | null = null
/** Loads Razorpay's Checkout script once, on first use, so residents who never pay never load it. */
function loadCheckout() {
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => { checkoutScript = null; reject(new Error('Checkout failed to load')) }
    document.body.append(script)
  })
  return checkoutScript
}

/**
 * "Pay ₹X online" for everything the resident owes. The server creates the order (and so decides
 * the amount); this only opens Checkout and hands the result back for signature verification.
 */
export function PayRentButton({ rent, onPaid, onNotice, className = '' }: { rent: RentSummary; onPaid: () => Promise<void>; onNotice: (message: string) => void; className?: string }) {
  const [isBusy, setIsBusy] = useState(false)

  async function pay() {
    setIsBusy(true)
    try {
      const [response] = await Promise.all([fetch('/api/resident-portal/rent/order', { method: 'POST' }), loadCheckout()])
      if (!response.ok) { onNotice(await readApiError(response, 'Could not start the payment.')); setIsBusy(false); return }
      const order = await response.json() as Order
      if (!window.Razorpay) throw new Error('Checkout unavailable')
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Rent payment',
        description: `Rent for ${order.months.length} ${order.months.length === 1 ? 'month' : 'months'}`,
        prefill: order.prefill,
        theme: { color: '#167c70' },
        handler: (result) => { void verify(result) },
        modal: { ondismiss: () => setIsBusy(false) },
      })
      checkout.on('payment.failed', (failure) => onNotice(failure.error.description ?? 'The payment failed. No money was taken; please try again.'))
      checkout.open()
    } catch {
      onNotice('Could not open the payment window. Check your connection and try again.')
      setIsBusy(false)
    }
  }

  async function verify(result: CheckoutResponse) {
    try {
      const response = await fetch('/api/resident-portal/rent/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) })
      onNotice(response.ok ? 'Payment received. Thank you!' : await readApiError(response, 'Your payment is being confirmed; it will show here shortly.'))
      await onPaid()
    } finally {
      setIsBusy(false)
    }
  }

  return <button type="button" className={`primary-button pay-rent-button ${className}`.trim()} disabled={isBusy} onClick={pay}><CreditCard size={15} /> {isBusy ? 'Opening payment…' : `Pay ${formatRupees(rent.amountDue)} online`}</button>
}
