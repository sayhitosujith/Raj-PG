/**
 * Razorpay credentials, read from the environment on each use so a restart after editing .env is
 * all it takes. Kept separate from the routes so the resident portal can ask "is online payment
 * on?" without importing the payment router (which itself imports the portal's guards).
 */
export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID
export const razorpayKeySecret = () => process.env.RAZORPAY_KEY_SECRET

/** True when the keys are configured, so the portal can offer "Pay online". */
export const isOnlinePaymentEnabled = () => Boolean(razorpayKeyId() && razorpayKeySecret())
