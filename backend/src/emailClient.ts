/**
 * Email through Resend's HTTPS API (https://resend.com/docs/api-reference/emails/send-email), which
 * works on Render's free plan where outbound SMTP may be blocked. Configured by RESEND_API_KEY and
 * EMAIL_FROM (e.g. "Raj Properties <noreply@rajpg.in>" on a domain verified in Resend); without a
 * key email is switched off. Resend's test sender (onboarding@resend.dev) only delivers to the
 * Resend account's own address, so residents need a verified domain.
 */
const apiUrl = 'https://api.resend.com/emails'

const apiKey = () => process.env.RESEND_API_KEY
export const emailFrom = () => process.env.EMAIL_FROM || 'onboarding@resend.dev'

/** True when a key is configured, so emails are sent. */
export const isEmailEnabled = () => Boolean(apiKey())

/** A loose shape check, so an obviously broken address is logged as skipped rather than sent. */
export const isEmailAddress = (value: string | null | undefined): value is string => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))

type Email = { to: string; subject: string; html: string; text: string; attachments?: Array<{ filename: string; content: Buffer }> }

/** Sends one email; returns Resend's message id, or throws with Resend's error message. */
export async function sendEmail(email: Email) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: emailFrom(), to: [email.to], subject: email.subject, html: email.html, text: email.text, attachments: email.attachments?.map(({ filename, content }) => ({ filename, content: content.toString('base64') })) }),
  })
  const body = await response.json().catch(() => ({})) as { id?: string; message?: string }
  if (!response.ok) throw new Error(`Email failed (${response.status}): ${body.message ?? 'unknown error'}`)
  return body.id ?? null
}
