import type { Resident } from './resident'
import { whatsappLink } from './siteData'

/** What POST /api/residents returns besides the resident: the new access key and the channels that delivered it. */
export type NewResidentResult = { accessKey: string; credentialsSent?: string[] }

/**
 * The welcome a new resident gets on WhatsApp from the owner's own phone, carrying the same login
 * details as the automatic email: their login (email, or phone when they have none), the access key
 * and where to sign in.
 */
export function welcomeMessage(resident: Pick<Resident, 'name' | 'property' | 'email' | 'phone'>, accessKey: string) {
  return [
    `Hi ${resident.name}, welcome to ${resident.property}!`,
    'Your resident app login:',
    `Login: ${resident.email || resident.phone}`,
    `Access key: ${accessKey}`,
    `Sign in at ${window.location.origin} and choose your own password. Please keep the access key private.`,
  ].join('\n')
}

/** A wa.me chat with the welcome already typed, or null when the resident has no phone. */
export function welcomeWhatsAppLink(resident: Pick<Resident, 'name' | 'property' | 'email' | 'phone'>, accessKey: string) {
  return resident.phone ? whatsappLink(resident.phone, welcomeMessage(resident, accessKey)) : null
}
