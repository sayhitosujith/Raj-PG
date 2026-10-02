/**
 * The app's emails: a plain branded layout (inline styles only, since email clients strip
 * stylesheets) plus a text version for clients that show no HTML. Everything that comes from
 * people (names, notices, messages) is escaped before it goes into the HTML.
 */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

type Block = { kind: 'p'; text: string } | { kind: 'rows'; rows: Array<[string, string]> } | { kind: 'button'; label: string; href: string }

const residentFooter = 'Residents can turn email updates off in their portal.'

function layout(business: string, heading: string, blocks: Block[], footer = residentFooter) {
  const body = blocks.map((block) => {
    if (block.kind === 'p') return `<p style="margin:0 0 14px;color:#3d4b47;font-size:14px;line-height:1.6">${escapeHtml(block.text)}</p>`
    if (block.kind === 'button') return `<p style="margin:18px 0"><a href="${escapeHtml(block.href)}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#167c70;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none">${escapeHtml(block.label)}</a></p>`
    return `<table role="presentation" style="width:100%;margin:6px 0 16px;border-collapse:collapse">${block.rows.map(([label, value]) => `<tr><td style="padding:7px 0;color:#6b7a76;font-size:13px;width:40%;border-bottom:1px solid #edf0ed">${escapeHtml(label)}</td><td style="padding:7px 0;color:#1f2d2b;font-size:13px;font-weight:600;border-bottom:1px solid #edf0ed">${escapeHtml(value)}</td></tr>`).join('')}</table>`
  }).join('')
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f8f6;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe5e1;border-radius:12px"><tr><td style="padding:22px 26px;border-bottom:4px solid #167c70"><strong style="color:#1f2d2b;font-size:17px">${escapeHtml(business)}</strong></td></tr><tr><td style="padding:24px 26px"><h1 style="margin:0 0 14px;color:#1f2d2b;font-size:20px">${escapeHtml(heading)}</h1>${body}</td></tr><tr><td style="padding:14px 26px;color:#8a9793;font-size:11px;border-top:1px solid #edf0ed">Sent by ${escapeHtml(business)}. ${escapeHtml(footer)}</td></tr></table></body></html>`
  const text = [business, heading, ...blocks.map((block) => block.kind === 'p' ? block.text : block.kind === 'button' ? `${block.label}: ${block.href}` : block.rows.map(([label, value]) => `${label}: ${value}`).join('\n'))].join('\n\n')
  return { html, text }
}

/** "Received ₹15,000 for October 2026", with the PDF receipt attached by the caller. */
export function paymentReceivedEmail(input: { business: string; name: string; amount: string; month: string; property: string }) {
  return { subject: `Rent received for ${input.month}`, ...layout(input.business, `Thank you, ${input.name}`, [
    { kind: 'p', text: `We have received your rent for ${input.month}. Your receipt is attached.` },
    { kind: 'rows', rows: [['Amount', input.amount], ['Rent for', input.month], ['Property', input.property]] },
  ]) }
}

/** Reminder 1, reminder 2 or the overdue notice. */
export function rentReminderEmail(input: { business: string; name: string; amount: string; months: string; property: string; dueDate: string; overdue: boolean; lockWarning: string | null; portalUrl: string }) {
  return { subject: input.overdue ? `Your rent for ${input.months} is overdue` : `Rent reminder: ${input.amount} due by ${input.dueDate}`, ...layout(input.business, input.overdue ? 'Your rent is overdue' : 'Rent reminder', [
    { kind: 'p', text: input.overdue ? `Hi ${input.name}, your rent was due on ${input.dueDate} and is now overdue. Please pay today to avoid further late fees.` : `Hi ${input.name}, this is a reminder that your rent is due by ${input.dueDate}.` },
    { kind: 'rows', rows: [['Amount due', input.amount], ['For', input.months], ['Property', input.property], ['Due by', input.dueDate]] },
    // The final reminder: an email cannot count down, so it names the moment access stops.
    ...(input.lockWarning ? [{ kind: 'p' as const, text: `This is your last reminder. If the rent is not paid, your access to the resident app will be blocked at ${input.lockWarning}.` }] : []),
    { kind: 'button', label: 'Pay in the resident portal', href: input.portalUrl },
  ]) }
}

/** A new resident's sign-in details, in the owner's wording: welcome, login and temporary access key. */
export function residentWelcomeEmail(input: { business: string; name: string; property: string; login: string; accessKey: string; portalUrl: string }) {
  return { subject: `Welcome to ${input.property}: your login details`, ...layout(input.business, `Welcome to ${input.property}`, [
    { kind: 'p', text: `Hi ${input.name}, your login credentials are:` },
    { kind: 'rows', rows: [[input.login.includes('@') ? 'Email' : 'Phone', input.login], ['Temporary access key', input.accessKey]] },
    { kind: 'p', text: 'Sign in with these, then choose your own password. Please keep the access key private.' },
    { kind: 'button', label: 'Open the resident portal', href: input.portalUrl },
  ]) }
}

/** Fire alarm to a resident: leave now. Sent whatever their email preference, since it is an emergency. */
export function fireAlertEmail(input: { business: string; name: string; property: string; raisedBy: string; portalUrl: string }) {
  return { subject: `FIRE ALARM at ${input.property}: leave the building now`, ...layout(input.business, `Fire alarm at ${input.property}`, [
    { kind: 'p', text: `${input.name}, a fire alarm has been raised at ${input.property} by ${input.raisedBy}. Leave the building now by the nearest exit. Do not use the lift.` },
    { kind: 'p', text: 'Call 101 (fire) or 112 (all emergencies) if you have not already. Stay outside until your property owner says it is safe.' },
    { kind: 'button', label: 'Open the resident portal', href: input.portalUrl },
  ], 'This emergency alert is sent to every resident of the property.') }
}

/** To the owner when a resident reports a fire, so they can act and clear the alarm once safe. */
export function fireReportedEmail(input: { business: string; property: string; raisedBy: string; adminUrl: string }) {
  return { subject: `FIRE reported at ${input.property} by ${input.raisedBy}`, ...layout(input.business, `Fire reported at ${input.property}`, [
    { kind: 'p', text: `${input.raisedBy} raised the fire alarm at ${input.property}. Every resident there is being alerted in their portal and by email.` },
    { kind: 'p', text: 'Call 101 (fire) or 112 if needed. Clear the alarm from your dashboard once the building is safe.' },
    { kind: 'button', label: 'Open the dashboard', href: input.adminUrl },
  ], 'You get this as a super admin (or the contact email) of this workspace.') }
}

/** A new notice from the owner. */
export function announcementEmail(input: { business: string; name: string; title: string; message: string; property: string }) {
  return { subject: `${input.property}: ${input.title}`, ...layout(input.business, input.title, [
    { kind: 'p', text: `Hi ${input.name}, a new notice for ${input.property}:` },
    { kind: 'p', text: input.message },
  ]) }
}

/** To the owner, the moment someone submits the public booking form. */
export function bookingAlertEmail(input: { business: string; name: string; phone: string; email: string | null; property: string; source: string; moveIn: string | null; food: string | null; message: string; adminUrl: string }) {
  return { subject: `New booking request: ${input.name} (${input.source})`, ...layout(input.business, 'New booking request', [
    { kind: 'p', text: `${input.name} asked about ${input.property} through your ${input.source} link.` },
    { kind: 'rows', rows: [['Name', input.name], ['Phone', input.phone], ...(input.email ? [['Email', input.email] as [string, string]] : []), ['Property', input.property], ['Move-in', input.moveIn ?? 'Not given'], ['Food plan', input.food ?? 'Not given'], ['Came from', input.source]] },
    ...(input.message ? [{ kind: 'p' as const, text: `Message: “${input.message}”` }] : []),
    { kind: 'button', label: 'Open booking requests', href: input.adminUrl },
  ], 'You get this as a super admin (or the contact email) of this workspace.') }
}
