import { Router } from 'express'
import { prisma } from './db.js'
import { emailFrom, isEmailAddress, isEmailEnabled, sendEmail } from './emailClient.js'
import { getSettings } from './settings.js'

/** Owner routes for email setup (Settings page); must be mounted behind the super admin guard. */
export const emailAdminRouter = Router()

// Whether email is configured, who it is sent from, where booking alerts go, and the latest emails.
emailAdminRouter.get('/email/status', async (_request, response) => {
  try {
    const [settings, recent] = await Promise.all([getSettings(), prisma.outboundMessage.findMany({ where: { channel: 'email' }, orderBy: { createdAt: 'desc' }, take: 20, include: { resident: { select: { name: true } } } })])
    response.json({
      enabled: isEmailEnabled(),
      from: emailFrom(),
      // Resend's shared test sender only delivers to the Resend account's own address.
      usingTestSender: !process.env.EMAIL_FROM,
      alertsTo: isEmailAddress(settings.contactEmail) ? settings.contactEmail : null,
      recent: recent.map(({ resident, ...message }) => ({ ...message, residentName: resident?.name ?? null })),
    })
  } catch (error) {
    console.error('Email status failed:', error)
    response.status(503).json({ error: 'Email status could not be loaded.' })
  }
})

// A one-off test email, to check the key and sender before any real email goes out.
emailAdminRouter.post('/email/test', async (request, response) => {
  if (!isEmailEnabled()) { response.status(503).json({ error: 'Add RESEND_API_KEY on the server first.' }); return }
  const to = String((request.body as { to?: unknown }).to ?? '').trim()
  if (!isEmailAddress(to)) { response.status(400).json({ error: 'Enter a valid email address.' }); return }
  try {
    const { businessName } = await getSettings()
    await sendEmail({ to, subject: `Test email from ${businessName}`, html: `<p>This is a test email from ${businessName}. Email is set up correctly.</p>`, text: `This is a test email from ${businessName}. Email is set up correctly.` })
    response.json({ ok: true })
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'The email could not be sent.' })
  }
})
