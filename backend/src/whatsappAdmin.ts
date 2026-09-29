import { Router } from 'express'
import { prisma } from './db.js'
import { templates } from './notifications.js'
import { runRentReminders } from './rentReminders.js'
import { normalizePhone } from './validation.js'
import { isWhatsAppEnabled, sendTemplate, templateLanguage, whatsappNumber } from './whatsappClient.js'

/** Owner routes for WhatsApp setup (Settings page); must be mounted behind the super admin guard. */
export const whatsappAdminRouter = Router()

// Whether WhatsApp is configured, the template names to create, and the latest messages sent.
whatsappAdminRouter.get('/whatsapp/status', async (_request, response) => {
  try {
    const recent = await prisma.outboundMessage.findMany({ where: { channel: 'whatsapp' }, orderBy: { createdAt: 'desc' }, take: 20, include: { resident: { select: { name: true } } } })
    response.json({
      enabled: isWhatsAppEnabled(),
      cronConfigured: Boolean(process.env.CRON_SECRET),
      language: templateLanguage(),
      templates: Object.values(templates),
      recent: recent.map(({ resident, ...message }) => ({ ...message, residentName: resident?.name ?? null })),
    })
  } catch (error) {
    console.error('WhatsApp status failed:', error)
    response.status(503).json({ error: 'WhatsApp status could not be loaded.' })
  }
})

// Sends Meta's pre-approved "hello_world" sample, to check the keys work before any template is approved.
whatsappAdminRouter.post('/whatsapp/test', async (request, response) => {
  if (!isWhatsAppEnabled()) { response.status(503).json({ error: 'Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server first.' }); return }
  const phone = normalizePhone(String((request.body as { phone?: unknown }).phone ?? ''))
  if (!phone) { response.status(400).json({ error: 'Enter a valid 10-digit mobile number.' }); return }
  try {
    await sendTemplate(whatsappNumber(phone), 'hello_world', [], undefined, 'en_US')
    response.json({ ok: true })
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'WhatsApp rejected the message.' })
  }
})

// The same run the daily cron makes, for trying reminders out without waiting for the schedule.
whatsappAdminRouter.post('/whatsapp/run-rent-reminders', async (_request, response) => {
  try { response.json(await runRentReminders()) } catch (error) {
    console.error('Manual reminder run failed:', error)
    response.status(503).json({ error: 'The reminder run failed.' })
  }
})
