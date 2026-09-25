/** Card uploads are stored as data URLs; only these document types are accepted and served. */
export const aadharCardDataUrlPattern = /^data:(image\/jpeg|image\/png|application\/pdf);base64,(.+)$/s

const aadharNumberPattern = /^\d{12}$/
const maxAadharCardBytes = 2_000_000

/** An Aadhaar number is exactly 12 digits. */
export function isValidAadharNumber(value: string) {
  return aadharNumberPattern.test(value)
}

/** Why an uploaded card is unacceptable, or null when it is fine. */
export function findAadharCardProblem(dataUrl: string) {
  const match = dataUrl.match(aadharCardDataUrlPattern)
  if (!match) return 'Aadhaar card must be a JPG, PNG, or PDF.'
  // Base64 encodes 3 bytes in 4 characters, so the decoded size can be checked without decoding.
  if (Math.floor(match[2].length * 3 / 4) > maxAadharCardBytes) return 'Aadhaar card must be smaller than 2 MB.'
  return null
}

/** An owner can only verify what they can see: both the number and the card must be on file. */
export function hasCompleteAadhar(aadharNumber: string | null | undefined, hasCard: boolean) {
  return Boolean(aadharNumber) && hasCard
}
