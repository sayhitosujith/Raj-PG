const aadharNumberPattern = /^\d{12}$/

/** An Aadhaar number is exactly 12 digits. */
export function isValidAadharNumber(value: string) {
  return aadharNumberPattern.test(value)
}
