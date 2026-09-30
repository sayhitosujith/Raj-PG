/**
 * WhatsApp Business Platform (Cloud API) client. Configured by WHATSAPP_ACCESS_TOKEN and
 * WHATSAPP_PHONE_NUMBER_ID (Meta developer console -> WhatsApp -> API setup); without them
 * WhatsApp is switched off and nothing is sent. The app only starts conversations, so every
 * message is a pre-approved template (WHATSAPP_TEMPLATE_LANGUAGE, default "en").
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

/** Sends a template with body variables {{1}}, {{2}}, ... and optionally a document header; returns the message id. */
export async function sendTemplate(to: string, name: string, bodyParams: string[], document?: { id: string; filename: string }, language = templateLanguage()) {
  const components = [
    ...(document ? [{ type: 'header', parameters: [{ type: 'document', document }] }] : []),
    ...(bodyParams.length ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: templateText(text) })) }] : []),
  ]
  const body = { messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: language }, components } }
  const result = await graph<{ messages?: Array<{ id: string }> }>('/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return result.messages?.[0]?.id ?? null
}
