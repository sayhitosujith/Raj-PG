import { formatMonthLabel, propertyNow, propertyUtcOffsetMs } from './dates.js'
import { prisma } from './db.js'
import { bedCounts } from './occupancy.js'
import { photoVersion } from './photo.js'
import { nextRentDue, rentStatus, type MonthConcession } from './rent.js'
import { getSettings, rentRulesOf, type RentRules } from './settings.js'
import { propertyIdWhere, residentOwnedWhere, residentWhere, type StaffAccess } from './staffAccess.js'

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`
const shortRupees = (amount: number) => (amount >= 1_00_000 ? `₹${(amount / 1_00_000).toFixed(2)}L` : rupees(amount))

/** One row of the Overview's "Recent activity". `icon` picks wallet, door or clipboard on the web side. */
type GridResident = { id: string; name: string; phone: string | null; joinedAt: Date; bedNumber: number | null; profilePhotoUpdatedAt: Date | null; monthlyRent: number | null; rentTrackedFrom: Date | null; active: boolean; rentPayments: Array<{ month: string }>; rentConcessions: MonthConcession[] }
type GridRoom = { number: string; beds: number; _count: { residents: number }; residents: GridResident[] }

/**
 * Occupancy for the Overview's room grid at one property: its beds taken and in total, and every set-up
 * room in room-number order (full rooms too, so the grid shows the whole property) with its beds, which
 * bed numbers are booked and by whom (shown when a booked bed is hovered; the dashboard only loads the
 * caller's own properties, so a receptionist sees no one they could not already see under Residents).
 * `unassigned` counts residents without a bed number yet, who still use a bed. Declared rooms that are
 * not set up yet have no number, so they are counted on their own (as one free bed each).
 */
function roomGridOf(property: { totalRooms: number | null; rooms: GridRoom[] }, rules: RentRules) {
  const rooms = property.rooms
    .map((room) => {
      const occupants = room.residents
        .flatMap((resident) => resident.bedNumber ? [{ bed: resident.bedNumber, id: resident.id, name: resident.name, phone: resident.phone, joinedAt: resident.joinedAt, photoVersion: photoVersion(resident.profilePhotoUpdatedAt), rent: rentDueOf(resident, rules) }] : [])
        .sort((a, b) => a.bed - b.bed)
      return { number: room.number, beds: room.beds, bookedBeds: occupants.map((occupant) => occupant.bed), occupants, unassigned: room.residents.length - occupants.length }
    })
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  return { beds: bedCounts(property), rooms, roomsNotSetUp: Math.max(0, (property.totalRooms ?? property.rooms.length) - property.rooms.length) }
}

/** A bed occupant's next rent date, worked out exactly as the Residents page does (rentStatus). */
function rentDueOf(resident: GridResident, rules: RentRules) {
  const paidMonths = resident.rentPayments.map((payment) => payment.month)
  return nextRentDue(rentStatus(resident, paidMonths, rules), paidMonths)
}

type ActivityRow ={ title: string; description: string; amount: string; time: string; tone: string; icon: 'wallet' | 'door' | 'clipboard'; at: number }

// Start of a property-local (IST) month as an instant; `offset` months from the current one.
function monthStart(offset: number) {
  const [year, month] = propertyNow().date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, 1) - propertyUtcOffsetMs)
}

// "Just now", "45 min ago", "3 h ago", "Yesterday", then "29 Sept".
function relativeTime(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  if (minutes < 48 * 60) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })
}

/**
 * Everything on the Overview that used to be placeholder text, worked out from real records: the
 * detail line under each stat card, rent collected this month against what is expected, the change
 * from last month, a tip about free rooms, and a recent-activity feed merged from rent payments, new
 * residents, booking requests, maintenance requests and move-out notices.
 */
export async function dashboardInsights(properties: Array<{ id: string; name: string; totalRooms: number | null; rooms: GridRoom[] }>, access: StaffAccess = { isOwner: true }) {
  // Everything below is limited to the caller's properties (all of them for a super admin).
  const residents_ = residentWhere(access)
  const byProperty = propertyIdWhere(access)
  const rentOf = residentOwnedWhere(access)
  const thisMonth = monthStart(0)
  const lastMonth = monthStart(-1)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  // Cached after the first read (see settings.ts), so this costs no extra query on most loads.
  const rentRules = rentRulesOf(await getSettings())
  // Rent collected = money received from the 1st to the end of this month (property time), whatever month it
  // pays for; the detail line splits it into this month's rent, rent paid in advance and late rent. There is
  // no percentage: a resident paying months ahead would put it far past 100%. Months are "YYYY-MM".
  const monthNow = propertyNow().date.slice(0, 7)
  const receivedThisMonth = { paidAt: { gte: thisMonth }, ...rentOf }
  const [collected, collectedLast, forThisMonth, ahead, joinedThisMonth, openRequests, newRequests, payments, residents, bookings, requests, exits] = await Promise.all([
    prisma.rentPayment.aggregate({ _sum: { amount: true }, where: receivedThisMonth }),
    prisma.rentPayment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: lastMonth, lt: thisMonth }, ...rentOf } }),
    prisma.rentPayment.aggregate({ _sum: { amount: true }, where: { ...receivedThisMonth, month: monthNow } }),
    prisma.rentPayment.aggregate({ _sum: { amount: true }, where: { ...receivedThisMonth, month: { gt: monthNow } } }),
    prisma.resident.count({ where: { joinedAt: { gte: thisMonth }, ...residents_ } }),
    prisma.maintenanceRequest.count({ where: { status: { not: 'resolved' }, ...byProperty } }),
    prisma.maintenanceRequest.count({ where: { status: { not: 'resolved' }, createdAt: { gte: weekAgo }, ...byProperty } }),
    prisma.rentPayment.findMany({ where: rentOf, orderBy: { paidAt: 'desc' }, take: 6, select: { amount: true, month: true, paidAt: true, resident: { select: { name: true } } } }),
    prisma.resident.findMany({ where: residents_, orderBy: { createdAt: 'desc' }, take: 4, select: { name: true, createdAt: true, room: { select: { number: true, property: { select: { name: true } } } } } }),
    prisma.booking.findMany({ where: byProperty, orderBy: { createdAt: 'desc' }, take: 4, select: { residentName: true, createdAt: true, property: { select: { name: true } } } }),
    prisma.maintenanceRequest.findMany({ where: byProperty, orderBy: { createdAt: 'desc' }, take: 4, select: { title: true, createdAt: true, property: { select: { name: true } } } }),
    prisma.resident.findMany({ where: { exitRequestedAt: { not: null }, ...residents_ }, orderBy: { exitRequestedAt: 'desc' }, take: 4, select: { name: true, exitRequestedAt: true, exitDate: true } }),
  ])

  const collectedNow = collected._sum.amount ?? 0
  const collectedBefore = collectedLast._sum.amount ?? 0
  const thisMonthsRent = forThisMonth._sum.amount ?? 0
  const paidAhead = ahead._sum.amount ?? 0
  const lateRent = Math.max(0, collectedNow - thisMonthsRent - paidAhead)
  const monthName = new Date(`${monthNow}-01T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long' })
  const beds = properties.map((property) => ({ name: property.name, ...bedCounts(property) }))
  const totalBeds = beds.reduce((sum, property) => sum + property.total, 0)
  const freeBeds = beds.reduce((sum, property) => sum + Math.max(0, property.total - property.taken), 0)
  const emptiest = properties.map((property, index) => ({ property, free: Math.max(0, beds[index].total - beds[index].taken) })).sort((a, b) => b.free - a.free)[0]
  const change = collectedBefore > 0 ? Math.round(((collectedNow - collectedBefore) / collectedBefore) * 1000) / 10 : null

  const rows: ActivityRow[] = [
    ...payments.map((payment) => ({ title: 'Rent received', description: `${payment.resident.name} · ${formatMonthLabel(payment.month)}`, amount: rupees(payment.amount), time: relativeTime(payment.paidAt), tone: 'sage', icon: 'wallet' as const, at: payment.paidAt.getTime() })),
    ...residents.map((resident) => ({ title: 'New resident', description: `${resident.name}${resident.room ? ` · ${resident.room.property.name}, room ${resident.room.number}` : ''}`, amount: '', time: relativeTime(resident.createdAt), tone: 'blue', icon: 'door' as const, at: resident.createdAt.getTime() })),
    ...bookings.map((booking) => ({ title: 'Booking request', description: `${booking.residentName} · ${booking.property.name}`, amount: '', time: relativeTime(booking.createdAt), tone: 'gold', icon: 'clipboard' as const, at: booking.createdAt.getTime() })),
    ...requests.map((request) => ({ title: 'Maintenance request', description: `${request.title} · ${request.property.name}`, amount: '', time: relativeTime(request.createdAt), tone: 'coral', icon: 'clipboard' as const, at: request.createdAt.getTime() })),
    ...exits.flatMap((resident) => resident.exitRequestedAt ? [{ title: 'Move-out notice', description: `${resident.name}${resident.exitDate ? ` · leaving ${resident.exitDate.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })}` : ''}`, amount: '', time: relativeTime(resident.exitRequestedAt), tone: 'coral', icon: 'door' as const, at: resident.exitRequestedAt.getTime() }] : []),
  ]

  return {
    collected: shortRupees(collectedNow),
    details: {
      properties: freeBeds ? `${freeBeds} ${freeBeds === 1 ? 'bed' : 'beds'} free` : totalBeds ? 'All beds full' : 'No rooms set up yet',
      residents: joinedThisMonth ? `${joinedThisMonth} joined this month` : 'No new residents this month',
      collected: collectedNow ? [`${shortRupees(thisMonthsRent)} for ${monthName}`, paidAhead ? `${shortRupees(paidAhead)} paid in advance` : '', lateRent ? `${shortRupees(lateRent)} late rent` : ''].filter(Boolean).join(' · ') : 'Nothing received yet this month',
      openRequests: openRequests ? (newRequests ? `${newRequests} new this week` : 'Waiting for you') : 'All clear',
    },
    insight: change === null
      ? { headline: `Collected ${shortRupees(collectedNow)} so far`, emphasis: '', note: 'Nothing was recorded last month to compare with.' }
      : { headline: `Rent collection is ${change >= 0 ? 'up' : 'down'}`, emphasis: `${Math.abs(change)}%`, note: `${shortRupees(collectedNow)} received so far this month, against ${shortRupees(collectedBefore)} last month.` },
    tip: emptiest && emptiest.free > 0
      ? { title: 'Keep your rooms moving', text: `${emptiest.free} ${emptiest.free === 1 ? 'bed is' : 'beds are'} free at ${emptiest.property.name}. Share your booking link to fill ${emptiest.free === 1 ? 'it' : 'them'}.`, propertyId: emptiest.property.id, ...roomGridOf(emptiest.property, rentRules) }
      : { title: 'Every bed is taken', text: totalBeds ? 'All beds are occupied. Keep a waiting list from booking requests.' : 'Add rooms under Properties to start tracking occupancy.' },
    activity: rows.sort((a, b) => b.at - a.at).slice(0, 6).map(({ at: _at, ...row }) => row),
  }
}
