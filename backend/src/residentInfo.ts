/**
 * The resident portal's Info tab: per-property Wi-Fi, important contacts and check-in / check-out /
 * gate times, plus the owner's own house rules and FAQs from Settings. Stored as plain text so the
 * owner edits them in ordinary text boxes; parsed into lists here for the portal.
 */

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const maxContactsLength = 1500
const maxWifiLength = 64

/** The property fields this covers, as the add/edit property form sends them. */
type PropertyInfoInput = Partial<Record<'wifiName' | 'wifiPassword' | 'contacts' | 'checkInTime' | 'checkOutTime' | 'gateClosingTime', unknown>>

/**
 * Validates the Info fields of a property body. Blank clears a field; absent leaves it alone.
 * Times must be "HH:MM"; contacts are free text, one per line.
 */
export function parsePropertyInfo(body: PropertyInfoInput): { data: Record<string, string | null> } | { error: string } {
  const data: Record<string, string | null> = {}
  for (const field of ['wifiName', 'wifiPassword'] as const) {
    const value = body[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') return { error: 'Wi-Fi details must be text.' }
    const text = (value ?? '').trim()
    if (text.length > maxWifiLength) return { error: `Wi-Fi details can be up to ${maxWifiLength} characters.` }
    data[field] = text || null
  }
  if (body.contacts !== undefined) {
    if (body.contacts !== null && typeof body.contacts !== 'string') return { error: 'Contacts must be text.' }
    const text = (body.contacts ?? '').trim()
    if (text.length > maxContactsLength) return { error: `Contacts can be up to ${maxContactsLength} characters.` }
    data.contacts = text || null
  }
  for (const [field, label] of [['checkInTime', 'Check-in time'], ['checkOutTime', 'Check-out time'], ['gateClosingTime', 'Gate closing time']] as const) {
    const value = body[field]
    if (value === undefined) continue
    if (value === null || value === '') { data[field] = null; continue }
    if (typeof value !== 'string' || !timePattern.test(value)) return { error: `${label} must be a time like 22:30.` }
    data[field] = value
  }
  return { data }
}

/** "Warden – Ravi: 98450 12345" → { label, phone }; a line without a colon is all label, no number. */
function parseContacts(text: string | null) {
  return (text ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const split = line.lastIndexOf(':')
    return split > 0 ? { label: line.slice(0, split).trim(), phone: line.slice(split + 1).trim() } : { label: line, phone: '' }
  })
}

/** FAQ text: blocks separated by a blank line; the first line is the question, the rest the answer. */
function parseFaqs(text: string) {
  return text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const [question, ...answer] = block.split('\n')
    return { question: question.replace(/^Q[:.]\s*/i, '').trim(), answer: answer.join(' ').replace(/^A[:.]\s*/i, '').trim() }
  })
}

type PropertyInfo = { location: string; wifiName: string | null; wifiPassword: string | null; contacts: string | null; checkInTime: string | null; checkOutTime: string | null; gateClosingTime: string | null }

/** Everything the Info tab shows, for the resident's property and the business. */
export function residentInfoOf(property: PropertyInfo | null | undefined, settings: { extraHouseRules: string; faqs: string }) {
  return {
    wifi: property?.wifiName ? { name: property.wifiName, password: property.wifiPassword } : null,
    contacts: parseContacts(property?.contacts ?? null),
    times: { checkIn: property?.checkInTime ?? null, checkOut: property?.checkOutTime ?? null, gateClosing: property?.gateClosingTime ?? null },
    location: property?.location ?? '',
    rules: settings.extraHouseRules.split('\n').map((line) => line.replace(/^[\s•\-–*\d.)]+/, '').trim()).filter(Boolean),
    faqs: parseFaqs(settings.faqs),
  }
}
