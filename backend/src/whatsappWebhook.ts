import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { respond, type IncomingMessage, type Reply } from './whatsappBot.js'
import { claimMessage, prismaBotStore } from './whatsappBotStore.js'
import { isWhatsAppEnabled, sendList, sendText } from './whatsappClient.js'

/**
 * Meta's webhook for incoming WhatsApp messages, which drives the receptionist bot. Needs, besides
 * the sending keys, WHATSAPP_VERIFY_TOKEN (any string, typed again in Meta's webhook setup) and
 * WHATSAPP_APP_SECRET (Meta app -> App settings -> Basic), which signs every delivery.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
 */
const verifyToken = () => process.env.WHATSAPP_VERIFY_TOKEN
const appSecret = () => process.env.WHATSAPP_APP_SECRET

/** True when the bot can both receive (verified, signed webhook) and reply. */
export const isWhatsAppBotEnabled = () => Boolean(isWhatsAppEnabled() && verifyToken() && appSecret())

/** The one-time handshake Meta does when the webhook URL is saved: echo the challenge if the token matches. */
export function whatsappWebhookVerify(request: Request, response: Response) {
  const token = verifyToken()
  if (token && request.query['hub.mode'] === 'subscribe' && request.query['hub.verify_token'] === token) { response.type('text/plain').send(String(request.query['hub.challenge'] ?? '')); return }
  response.sendStatus(403)
}

// Meta signs the raw body with the app secret (X-Hub-Signature-256: sha256=<hex>).
function isSignedByMeta(raw: Buffer, header: string | undefined, secret: string) {
  if (!header?.startsWith('sha256=')) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'))
  const given = Buffer.from(header.slice(7))
  return given.length === expected.length && timingSafeEqual(given, expected)
}

type WebhookMessage = { from?: string; id?: string; type?: string; text?: { body?: string }; interactive?: { list_reply?: { id?: string }; button_reply?: { id?: string } }; button?: { text?: string } }
type WebhookBody = { entry?: Array<{ changes?: Array<{ field?: string; value?: { metadata?: { phone_number_id?: string }; messages?: WebhookMessage[] } }> }> }

/** The residents' messages in a delivery to our number, ignoring delivery receipts and anything else. */
function messagesIn(body: WebhookBody): Array<IncomingMessage & { id: string }> {
  const ours = process.env.WHATSAPP_PHONE_NUMBER_ID
  return (body.entry ?? []).flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === 'messages' && change.value?.metadata?.phone_number_id === ours)
    .flatMap((change) => change.value?.messages ?? [])
    .filter((message): message is WebhookMessage & { from: string; id: string } => Boolean(message.from && message.id))
    .map((message) => ({
      from: message.from,
      id: message.id,
      text: message.text?.body ?? message.button?.text,
      choice: message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id,
    }))
}

const send = (to: string, reply: Reply) => (reply.kind === 'text' ? sendText(to, reply.body) : sendList(to, reply.body, reply.button, reply.rows))

async function answer(message: IncomingMessage & { id: string }) {
  if (!(await claimMessage(message.from, message.id))) return
  // In order, so a resident sees the replies in the sequence the bot wrote them.
  for (const reply of await respond(message, prismaBotStore)) await send(message.from, reply)
}

/**
 * Receives Meta's deliveries. Unsigned or wrongly signed requests are refused. A valid one is
 * acknowledged at once (Meta retries anything slow) and the messages are answered afterwards.
 * Mounted with a raw body parser, since the signature covers the exact bytes.
 */
export function whatsappWebhook(request: Request, response: Response) {
  const secret = appSecret()
  if (!isWhatsAppBotEnabled() || !secret) { response.sendStatus(503); return }
  const raw = request.body as Buffer
  if (!Buffer.isBuffer(raw) || !isSignedByMeta(raw, request.get('x-hub-signature-256'), secret)) { response.sendStatus(401); return }
  let body: WebhookBody
  try { body = JSON.parse(raw.toString('utf8')) as WebhookBody } catch { response.sendStatus(400); return }
  response.sendStatus(200)
  void (async () => {
    for (const message of messagesIn(body)) {
      await answer(message).catch((error: unknown) => console.error('WhatsApp bot reply failed:', error))
    }
  })()
}
