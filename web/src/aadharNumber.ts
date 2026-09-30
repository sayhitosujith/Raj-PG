/**
 * An Aadhaar number grouped in fours, masked to its last four digits unless revealed, following
 * UIDAI guidance on displaying Aadhaar numbers.
 */
export function formatAadhar(aadharNumber: string, isRevealed = false) {
  const digits = aadharNumber.replace(/\D/g, '')
  const visible = isRevealed ? digits : 'X'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4)
  return visible.replace(/(.{4})(?=.)/g, '$1 ')
}
