/** File types the server accepts for identity documents, for an input's `accept` attribute. */
export const documentAccept = 'image/jpeg,image/png,application/pdf'

const documentTypes = documentAccept.split(',')
// Mirrors the server's limit so residents get the message before a slow upload fails.
const maxDocumentBytes = 2_000_000

/**
 * Validates a chosen identity document (Aadhaar card, passport photo page) and reads it as a data
 * URL, the format the API stores. `documentName` words the errors ("Aadhaar card").
 */
export function readDocumentFile(file: File, documentName: string): Promise<{ dataUrl: string } | { error: string }> {
  if (!documentTypes.includes(file.type)) return Promise.resolve({ error: `Upload a JPG, PNG, or PDF ${documentName.toLowerCase()}.` })
  if (file.size > maxDocumentBytes) return Promise.resolve({ error: `Please choose a ${documentName.toLowerCase()} smaller than 2 MB.` })
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ dataUrl: String(reader.result) })
    reader.onerror = () => resolve({ error: 'That file could not be read. Try another one.' })
    reader.readAsDataURL(file)
  })
}
