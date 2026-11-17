import { prisma } from './db.js'
import { formatMonthLabel, propertyNow } from './dates.js'
import { upcomingHolidays } from './holidays.js'
import { toMealTimes } from './meals.js'
import { rupees } from './money.js'
import { displayName } from './names.js'
import { rentSummary } from './rent.js'
import { residentInfoOf } from './residentInfo.js'
import { isResidentFeatureOn } from './residentFeatures.js'
import { noticeDaysOf } from './exits.js'
import { getSettings, houseRulesOf } from './settings.js'

/**
 * What the resident AI assistant knows about one resident, as plain text for its system prompt: the same facts the
 * portal already shows them (rent, Wi-Fi, house rules, FAQs, meal times, holidays, contacts), honouring every
 * Settings > Resident features switch. ID numbers, documents, door PINs, addresses and other residents are never
 * included, so nothing reaches the model that the resident could not already see, and nothing personal beyond it.
 */
export async function assistantFacts(residentId: string, receptionistEmail: string | null) {
  const [resident, settings, rent] = await Promise.all([
    prisma.resident.findUniqueOrThrow({ where: { id: residentId }, select: { name: true, bedNumber: true, foodOpted: true, room: { include: { property: true } } } }),
    getSettings(),
    rentSummary(residentId),
  ])
  const property = resident.room?.property
  const on = (feature: Parameters<typeof isResidentFeatureOn>[1]) => isResidentFeatureOn(settings.residentFeatures, feature)
  const info = residentInfoOf(property, settings)
  const rules = houseRulesOf(settings)
  const holidays = on('holidays') ? await upcomingHolidays(60) : []
  const meals = property && on('meals') ? toMealTimes(property) : null
  const lines = [
    `Today (India time): ${propertyNow().date}`,
    `Resident: ${displayName(resident.name)}`,
    `PG: ${property?.name ?? 'unknown'}${property?.city ? `, ${property.city}` : ''}; room ${resident.room?.number ?? '-'}${resident.bedNumber ? `, bed ${resident.bedNumber}` : ''}`,
    rentLine(rent),
    `Rent is due by day ${rent.dueDay} of each month; a late fee of ${rupees(rent.lateFee)} is added for each month paid after that.`,
    on('payments') ? 'Rent can be paid in the app under Payments.' : 'Online payment is switched off; rent is paid to the reception.',
    info.wifi ? `Wi-Fi network: ${info.wifi.name}${info.wifi.password ? `, password: ${info.wifi.password}` : ''}` : 'Wi-Fi details: not available in the app.',
    `Visiting hours: ${rules.visitingHours ?? 'not set'}. Quiet hours: ${rules.quietHours ?? 'not set'}.`,
    info.times.gateOpening ? `Gate opens at ${info.times.gateOpening}.` : '',
    info.times.gateClosing ? `Gate closes at ${info.times.gateClosing}.` : '',
    info.rules.length ? `House rules: ${info.rules.join('; ')}` : '',
    `Move-out notice: at least ${noticeDaysOf(property, settings)} days, given in the app under Services > Exit PG.`,
    rules.securityDeposit ? `Security deposit: ${rupees(rules.securityDeposit)}.` : '',
    meals ? `Meal times: ${Object.entries(meals).map(([meal, time]) => `${meal} ${time.from}-${time.to}`).join(', ')}${resident.foodOpted ? '' : ' (this resident is not on the food plan)'}.` : '',
    holidays.length ? `Upcoming holidays: ${holidays.map((holiday) => `${holiday.name} (${holiday.date})`).join(', ')}.` : '',
    `Receptionist: phone ${property?.ownerPhone ?? settings.contactPhone ?? 'not set'}, email ${receptionistEmail ?? settings.contactEmail ?? 'not set'}.`,
    info.contacts.length ? `Other contacts: ${info.contacts.map((contact) => `${contact.label} ${contact.phone}`).join('; ')}.` : '',
    on('repairs') ? 'Repairs and complaints are reported in the app under Services > Complaints & repairs.' : '',
    on('housekeeping') ? 'Room cleaning is booked in the app under Services > Housekeeping.' : '',
    info.faqs.length ? `FAQs:\n${info.faqs.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n')}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

function rentLine(rent: Awaited<ReturnType<typeof rentSummary>>) {
  if (rent.state === 'NOT_TRACKED') return 'Rent: not set up in the app yet; the reception can confirm the amount.'
  const owed = rent.outstandingMonths.length ? `owes ${rupees(rent.amountDue)} for ${rent.outstandingMonths.map(formatMonthLabel).join(', ')}${rent.overdueMonths.length ? ` (overdue: ${rent.overdueMonths.map(formatMonthLabel).join(', ')})` : ''}` : 'nothing owed right now'
  return `Rent: ${rupees(rent.monthlyRent ?? 0)} a month; ${owed}.`
}
