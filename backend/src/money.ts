/** "₹15,000": whole rupees with Indian digit grouping, as every message and summary writes amounts. */
export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`
