/** What the server says after creating or resending a registration link: the link itself and how WhatsApp went. */
export type RegistrationLinkResult = { registrationLink: string; whatsapp: 'sent' | 'failed' | 'skipped' }

/** The link's outcome in words: sent, or why it was not and that it can be shared by hand. */
export const linkOutcomeText = (name: string, { whatsapp }: RegistrationLinkResult) =>
  whatsapp === 'sent' ? `Registration link sent to ${name} on WhatsApp.` : whatsapp === 'failed' ? `The app's WhatsApp could not send the link to ${name}. Send it from your own WhatsApp instead.` : `The app's WhatsApp is not set up, so send the link to ${name} from your own WhatsApp.`

/** The token in a registration page's address (/register/<token>), or null for any other path. */
export const registrationToken = (path: string) => path.match(/^\/register\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? null

/**
 * A WhatsApp chat with the resident with the link already typed (wa.me), so staff send it from their own WhatsApp
 * when the app's WhatsApp is off or fails; null without a phone number. Opens the app on a phone, WhatsApp Web elsewhere.
 */
export function whatsappShareUrl(phone: string | null | undefined, name: string, link: string) {
  const digits = phone?.replace(/[^0-9]/g, '')
  if (!digits) return null
  const text = `Hi ${name.split(' ')[0]}, please complete your registration here: ${link} (the link works for 7 days).`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
