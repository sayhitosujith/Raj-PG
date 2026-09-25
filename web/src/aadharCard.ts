/** File types the server accepts for an Aadhaar card, for an input's `accept` attribute. */
export const aadharCardAccept = 'image/jpeg,image/png,application/pdf'

const aadharCardTypes = aadharCardAccept.split(',')
// Mirrors the server's limit so residents get the message before a slow upload fails.
const maxAadharCardBytes = 2_000_000

/**
 * Validates a chosen Aadhaar card file and reads it as a data URL, the format the API stores.
 * Shared by the owner's resident form and the resident's own verification screen.
 */
export function readAadharCard(file: File): Promise<{ dataUrl: string } | { error: string }> {
  if (!aadharCardTypes.includes(file.type)) return Promise.resolve({ error: 'Upload a JPG, PNG, or PDF Aadhaar card.' })
  if (file.size > maxAadharCardBytes) return Promise.resolve({ error: 'Please choose an Aadhaar card smaller than 2 MB.' })
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ dataUrl: String(reader.result) })
    reader.onerror = () => resolve({ error: 'That file could not be read. Try another one.' })
    reader.readAsDataURL(file)
  })
}
