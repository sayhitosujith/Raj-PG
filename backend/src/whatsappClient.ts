/**
 * WhatsApp Business Platform (Cloud API) client. Configured by WHATSAPP_ACCESS_TOKEN and
 * WHATSAPP_PHONE_NUMBER_ID (Meta developer console -> WhatsApp -> API setup); without them
 * WhatsApp is switched off and nothing is sent. Messages the app starts are pre-approved templates
 * (WHATSAPP_TEMPLATE_LANGUAGE, default "en"); replies to a resident who wrote in the last 24 hours
 * (the receptionist bot) may be free text or interactive lists.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */
import { normalizePhone } from './validation.js'

const graphUrl ='https://graph.facebook.com/v21.0'

const accessToken = () => process.env.WHATSAPP_ACCESS_TOKEN
const phoneNumberId = () => process.env.WHATSAPP_PHONE_NUMBER_ID
export const templateLanguage = () => process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en'

/** True when the keys are configured, so notifications are sent. */
export const isWhatsAppEnabled = () => Boolean(accessToken() && phoneNumberId())

/**
 * A stored phone number in the form WhatsApp expects (country code and number, no "+"), or null
 * when it is not a valid number, so a message is never sent to a guessed recipient.
 */
export const whatsappNumber = (phone: string) => normalizePhone(phone)?.slice(1) ?? null

/**
 * Template variables may not contain new lines, tabs or runs of spaces, and may not be empty,
 * so text from the app (announcements, notes) is flattened and capped first.
 */
export const templateText = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 900) || '-'

async function graph<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${graphUrl}/${phoneNumberId()}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken()}`, ...init.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } }
  if (!response.ok) throw new Error(`WhatsApp ${path} failed (${response.status}): ${body.error?.message ?? 'unknown error'}`)
  return body
}

/** Uploads a PDF (a rent receipt) so a template can attach it; returns the media id. */
export async function uploadPdf(pdf: Buffer, filename: string) {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'application/pdf')
  form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename)
  return (await graph<{ id: string }>('/media', { method: 'POST', body: form })).id
}

/** One choice in an interactive list; WhatsApp caps the title at 24 characters and the description at 72. */
export type ListRow = { id: string; title: string; description?: string }

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

async function sendMessage(to: string, message: Record<string, unknown>) {
  const result = await graph<{ messages?: Array<{ id: string }> }>('/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }) })
  return result.messages?.[0]?.id ?? null
}

/** A plain text reply (only inside the 24-hour window after the resident's last message). */
export const sendText = (to: string, body: string) => sendMessage(to, { type: 'text', text: { body: clip(body, 4096), preview_url: false } })

/**
 * An interactive list: `body` text with a button that opens up to 10 tappable rows. Over-long
 * texts are clipped to WhatsApp's limits rather than rejected, so one long FAQ never breaks the menu.
 */
export function sendList(to: string, body: string, button: string, rows: ListRow[]) {
  const listRows = rows.slice(0, 10).map((row) => ({ id: row.id, title: clip(row.title, 24), ...(row.description ? { description: clip(row.description, 72) } : {}) }))
  return sendMessage(to, { type: 'interactive', interactive: { type: 'list', body: { text: clip(body, 1024) }, action: { button: clip(button, 20), sections: [{ title: clip(button, 24), rows: listRows }] } } })
}

let businessNumber: Promise<string | null> | null = null
/**
 * The business's own WhatsApp number in E.164, read once from Meta and kept for the life of the
 * process, so the portal's "WhatsApp" button opens a chat with the bot. Null when WhatsApp is off
 * or Meta could not be reached (a later call tries again).
 */
export function whatsappBusinessNumber(): Promise<string | null> {
  if (!isWhatsAppEnabled()) return Promise.resolve(null)
  businessNumber ??= graph<{ display_phone_number?: string }>('?fields=display_phone_number', { method: 'GET' })
    .then((body) => (body.display_phone_number ? normalizePhone(`+${body.display_phone_number.replace(/\D/g, '')}`) : null))
    .catch((error: unknown) => { console.error('WhatsApp number lookup failed:', error); businessNumber = null; return null })
  return businessNumber
}

/** Sends a template with body variables {{1}}, {{2}}, ... and optionally a document header; returns the message id. */
export async function sendTemplate(to: string, name: string, bodyParams: string[], document?: { id: string; filename: string }, language = templateLanguage()) {
  const components = [
    ...(document ? [{ type: 'header', parameters: [{ type: 'document', document }] }] : []),
    ...(bodyParams.length ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: templateText(text) })) }] : []),
  ]
  return sendMessage(to, { type: 'template', template: { name, language: { code: language }, components } })
}
