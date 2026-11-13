import { emailFrom, isEmailEnabled } from './emailClient.js'
import { isOnlinePaymentEnabled } from './razorpayConfig.js'
import { isWeatherEnabled } from './weather.js'
import { isCricketEnabled } from './cricket.js'
import { isWhatsAppEnabled } from './whatsappClient.js'
import { isWhatsAppBotEnabled } from './whatsappWebhook.js'

/**
 * One line per integration at start-up, so the host's logs (e.g. Render -> Logs) show at a glance
 * which settings the running server actually picked up. Only reports presence: never a key's value.
 */
export function logIntegrations() {
  const line = (name: string, isOn: boolean, onText: string, offText: string) => console.log(`[config] ${name}: ${isOn ? onText : offText}`)
  line('Database', Boolean(process.env.DATABASE_URL), 'DATABASE_URL set', 'off, DATABASE_URL not set (is .env in backend/, not backend/src/?)')
  line('Email',isEmailEnabled(), `connected (sending as ${emailFrom()}${process.env.EMAIL_FROM ? '' : ', Resend test sender'})`, 'off, RESEND_API_KEY not set')
  line('WhatsApp', isWhatsAppEnabled(), 'connected', 'off, WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set')
  line('WhatsApp bot', isWhatsAppBotEnabled(), 'receiving at /api/whatsapp/webhook', 'off, needs WhatsApp plus WHATSAPP_VERIFY_TOKEN / WHATSAPP_APP_SECRET')
  line('Daily reminders', Boolean(process.env.CRON_SECRET), 'CRON_SECRET set', 'off, CRON_SECRET not set')
  line('Razorpay', isOnlinePaymentEnabled(), 'connected', 'off, RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set')
  line('Weather', isWeatherEnabled(), 'Open-Meteo (no key needed)', 'off')
  line('Cricket', isCricketEnabled(), `CricketData.org, refreshing every ${Number(process.env.CRICKET_REFRESH_MINUTES) || 15} min`, 'off, CRICKET_API_KEY not set')
}
