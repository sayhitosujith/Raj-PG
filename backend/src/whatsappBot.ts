import { formatMonthLabel } from './dates.js'
import { isMaintenanceCategory, maintenanceCategories, maintenanceLimits, type MaintenanceCategory } from './maintenance.js'
import { rupees } from './money.js'
import type { nextRentDue, rentStatus } from './rent.js'
import type { ListRow } from './whatsappClient.js'

/** One message from a resident: what they typed, or the id of the list row they tapped. */
export type IncomingMessage = { from: string; text?: string; choice?: string }

/** What the bot sends back; the webhook turns each into a WhatsApp text or list message. */
export type Reply = { kind: 'text'; body: string } | { kind: 'list'; body: string; button: string; rows: ListRow[] }

/** A resident the bot may help: matched by phone and allowed into the portal (see whatsappBotStore.ts). */
export type BotResident = { id: string; firstName: string; businessName: string; receptionPhone: string | null; portalUrl: string; lockMessage: string | null }

/**
 * Who wrote in. Unknown and shared numbers, and residents whose account is not approved or ID-verified
 * yet ('pending'), get no personal data, only how to reach reception.
 */
export type Sender = { kind: 'resident'; resident: BotResident } | { kind: 'unknown' | 'shared' | 'pending'; businessName: string; receptionPhone: string | null }

export type RentView = { status: ReturnType<typeof rentStatus>; next: ReturnType<typeof nextRentDue> }
export type InfoView = { wifi: { name: string; password: string | null } | null; faqs: Array<{ question: string; answer: string }> }
/** Mid-conversation state; null when the next message starts afresh. */
export type ChatStep = { step: 'repair'; category: MaintenanceCategory } | null

/**
 * Everything the bot reads or writes, kept behind one narrow interface so the conversation rules
 * here can be exercised without a database or Meta (Dependency Inversion).
 */
export interface BotStore {
  findSender(phone: string): Promise<Sender>
  rentOf(residentId: string): Promise<RentView>
  infoOf(residentId: string): Promise<InfoView>
  /** Files the repair request; false when the resident no longer has a room. */
  createRepair(residentId: string, category: MaintenanceCategory, title: string, details: string): Promise<boolean>
  loadStep(phone: string): Promise<ChatStep>
  saveStep(phone: string, step: ChatStep): Promise<void>
}

type Topic = 'menu' | 'rent' | 'wifi' | 'faqs' | 'repair' | 'receptionist'

// Checked in order, so "wifi password" is Wi-Fi rather than anything broader. Whole words only.
const keywords: Array<[Topic, RegExp]> = [
  ['receptionist', /\b(receptionist|reception|human|person|staff|manager|owner|call|talk|agent)\b/],
  ['wifi', /\b(wi-?fi|internet|password|network)\b/],
  ['repair', /\b(repair|broken|fix|leak|leaking|complaint|maintenance|not working)\b/],
  ['rent', /\b(rent|due|pay|payment|paid|balance|fee|dues)\b/],
  ['faqs', /\b(faqs?|questions?|rules|timings?|hours)\b/],
]
const greeting = /^(hi+|hello|hey|hii+|namaste|menu|start|help|options?)\b/
const cancelWords = /^(cancel|stop|menu|back|exit)$/

const categoryLabels: Record<MaintenanceCategory, string> = { plumbing: 'Plumbing', electrical: 'Electrical', wifi: 'Wi-Fi / internet', furniture: 'Furniture', cleaning: 'Cleaning', appliance: 'Appliance', other: 'Something else' }

const text = (body: string): Reply => ({ kind: 'text', body })

function receptionLine(phone: string | null) {
  return phone ? `Call or WhatsApp the receptionist on ${phone}.` : 'Please speak to the receptionist at the front desk.'
}

function menu(resident: BotResident, opening: string): Reply {
  return {
    kind: 'list',
    body: `${opening}\nTap *Choose* to pick what you need, or just type it (for example "rent" or "wifi").`,
    button: 'Choose',
    rows: [
      { id: 'rent', title: 'Rent due', description: 'What you owe and when it is due' },
      { id: 'wifi', title: 'Wi-Fi details', description: 'Network name and password' },
      { id: 'faqs', title: 'FAQs', description: `Common questions answered by ${resident.businessName}` },
      { id: 'repair', title: 'Report a repair', description: 'Plumbing, electrical, Wi-Fi and more' },
      { id: 'receptionist', title: 'Talk to receptionist', description: 'Their number, to call or chat' },
    ],
  }
}

const monthList = (months: string[]) => months.map(formatMonthLabel).join(', ')
const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Rent in a sentence or two, from the same status the portal shows. */
export function rentText({ status, next }: RentView, resident: BotResident) {
  if (status.state === 'NOT_TRACKED' || !next) return `Your rent isn't tracked in the app yet. ${receptionLine(resident.receptionPhone)}`
  const pay = `Pay in the portal: ${resident.portalUrl}`
  if (next.state === 'OVERDUE') {
    const fees = status.overdueMonths.length * status.lateFee
    return `⚠️ ${rupees(next.amount)} is overdue for ${monthList(status.outstandingMonths)}${fees ? `, including ${rupees(fees)} in late fees` : ''}. It was due on ${dayLabel(next.dueDate)}.\n${pay}`
  }
  if (next.state === 'DUE') return `${rupees(next.amount)} for ${formatMonthLabel(status.currentMonth)} is due by ${dayLabel(next.dueDate)}.\n${pay}`
  return `✅ You're paid up. Next: ${rupees(next.amount)} due by ${dayLabel(next.dueDate)}.`
}

function wifiText(info: InfoView, resident: BotResident) {
  if (!info.wifi) return `${resident.businessName} hasn't added Wi-Fi details yet. ${receptionLine(resident.receptionPhone)}`
  return `📶 *Wi-Fi*\nNetwork: ${info.wifi.name}${info.wifi.password ? `\nPassword: ${info.wifi.password}` : ''}`
}

function faqList(info: InfoView, resident: BotResident): Reply {
  if (!info.faqs.length) return text(`${resident.businessName} hasn't added FAQs yet. ${receptionLine(resident.receptionPhone)}`)
  const more = info.faqs.length > 10 ? `\nShowing 10 of ${info.faqs.length}; the rest are in the portal's Help tab.` : ''
  return { kind: 'list', body: `Pick a question to see its answer.${more}`, button: 'Questions', rows: info.faqs.slice(0, 10).map((faq, index) => ({ id: `faq:${index}`, title: faq.question, description: faq.question.length > 24 ? faq.question : undefined })) }
}

const repairCategories: Reply = { kind: 'list', body: 'What kind of problem is it?', button: 'Problem type', rows: maintenanceCategories.map((category) => ({ id: `repair:${category}`, title: categoryLabels[category] })) }

/** The repair title is the description's first line, so staff lists stay short; the full text goes in details. */
function splitRepair(description: string) {
  const firstLine = description.split('\n')[0].trim()
  const title = firstLine.length > maintenanceLimits.title ? `${firstLine.slice(0, maintenanceLimits.title - 1)}…` : firstLine
  return { title, details: description.length > title.length ? description.slice(0, maintenanceLimits.details) : '' }
}

async function answerTopic(topic: Topic, resident: BotResident, store: BotStore): Promise<Reply[]> {
  switch (topic) {
    case 'rent': return [text(rentText(await store.rentOf(resident.id), resident))]
    case 'wifi': return [text(wifiText(await store.infoOf(resident.id), resident))]
    case 'faqs': return [faqList(await store.infoOf(resident.id), resident)]
    case 'repair': return [repairCategories]
    case 'receptionist': return [text(receptionLine(resident.receptionPhone))]
    case 'menu': return [menu(resident, `Hi ${resident.firstName} 👋 How can I help?`)]
  }
}

async function answerChoice(choice: string, resident: BotResident, phone: string, store: BotStore): Promise<Reply[]> {
  if (choice.startsWith('faq:')) {
    const faq = (await store.infoOf(resident.id)).faqs[Number(choice.slice(4))]
    return [text(faq ? `*${faq.question}*\n${faq.answer || 'No answer has been added yet.'}` : 'That question is no longer listed.')]
  }
  if (choice.startsWith('repair:')) {
    const category = choice.slice(7)
    if (!isMaintenanceCategory(category)) return [repairCategories]
    await store.saveStep(phone, { step: 'repair', category })
    return [text(`Got it: ${categoryLabels[category]}. Describe the problem in one message (where it is and what's wrong).\nSend "cancel" to stop.`)]
  }
  const topic = (['rent', 'wifi', 'faqs', 'repair', 'receptionist'] as const).find((name) => name === choice)
  return answerTopic(topic ?? 'menu', resident, store)
}

/**
 * The bot's reply to one message. Unknown, shared or not-yet-approved numbers only learn how to reach reception, and
 * a resident locked out over rent gets the same explanation the portal gives, never Wi-Fi or
 * repairs, so the bot is not a way around the lock.
 */
export async function respond(message: IncomingMessage, store: BotStore): Promise<Reply[]> {
  const sender = await store.findSender(message.from)
  if (sender.kind !== 'resident') {
    const why = {
      shared: `This number is linked to more than one resident at ${sender.businessName}, so I can't tell who you are. Please use the resident portal.`,
      pending: `Hi! Your account at ${sender.businessName} isn't ready yet: it's waiting for approval or your ID check. I can help once it's done.`,
      unknown: `Hi! This number isn't registered with ${sender.businessName}. If you live here, ask reception to update your phone number.`,
    }[sender.kind]
    return [text(`${why} ${receptionLine(sender.receptionPhone)}`)]
  }
  const { resident } = sender
  if (resident.lockMessage) return [text(`${resident.lockMessage}\n${receptionLine(resident.receptionPhone)}`)]

  if (message.choice) return answerChoice(message.choice, resident, message.from, store)

  const typed = (message.text ?? '').trim()
  const lower = typed.toLowerCase()
  const step = await store.loadStep(message.from)
  if (step?.step === 'repair') {
    await store.saveStep(message.from, null)
    if (cancelWords.test(lower)) return [menu(resident, 'Okay, cancelled. Anything else?')]
    if (!typed) return [text('I can only read text for now. Please describe the problem in words, or use the portal to add a photo.')]
    const { title, details } = splitRepair(typed)
    const filed = await store.createRepair(resident.id, step.category, title, details)
    return [text(filed ? `✅ Your ${categoryLabels[step.category].toLowerCase()} request is logged and the staff have been told.\nTrack it in the portal: ${resident.portalUrl}` : `I couldn't file that because you're no longer listed in a room. ${receptionLine(resident.receptionPhone)}`)]
  }

  if (!typed) return [menu(resident, 'I can only read text for now.')]
  const topic = keywords.find(([, pattern]) => pattern.test(lower))?.[0]
  if (topic) return answerTopic(topic, resident, store)
  return [menu(resident, greeting.test(lower) ? `Hi ${resident.firstName} 👋 How can I help?` : "Sorry, I didn't catch that.")]
}
