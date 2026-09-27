import PDFDocument from 'pdfkit'
import { prisma } from './db.js'
import { getSettings } from './settings.js'

/**
 * Rent receipts: one PDF per recorded rent month (RentPayment), i.e. only after the owner has
 * recorded or confirmed it, or Razorpay has settled it. Built on demand from the ledger, so a
 * receipt always matches what the app records. Amounts are written "INR": the PDF standard fonts
 * have no rupee sign, and embedding a font for one glyph is not worth the weight.
 */
const timeZone = 'Asia/Kolkata'
const colors = { ink: '#1f2d2b', muted: '#6b7a76', teal: '#167c70', tealSoft: '#e8f3f0', line: '#dbe5e1', band: '#f4f8f6' }

const formatInr = (amount: number) => `INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { timeZone, day: 'numeric', month: 'long', year: 'numeric' })
function formatMonth(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-IN', { timeZone, month: 'long', year: 'numeric' })
}

/** Proper capitals for a name typed all lower or upper case; mixed case is kept as typed. Mirrors the web app's displayName. */
function displayName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) return trimmed
  return trimmed.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase())
}

/** Owners may paste a map link as the location; that is a link, not an address to print. */
const mapLink = (location: string) => (/^https?:\/\//i.test(location.trim()) ? location.trim() : null)

/** A stable, human-readable receipt number derived from the ledger row. */
export const receiptNumber = (rentPaymentId: string, month: string) => `RC-${month.replace('-', '')}-${rentPaymentId.slice(-6).toUpperCase()}`

type ReceiptData = {
  number: string
  business: { name: string; phone: string | null; email: string | null; logo: Buffer | null }
  resident: { name: string; phone: string | null; email: string | null; room: string; property: string; location: string }
  month: string
  amount: number
  paidAt: Date
  method: string
  reference: string | null
}

// The stored logo is a PNG/JPEG data URL (resized in the browser); anything else is skipped.
function logoImage(dataUrl: string | null) {
  const match = dataUrl?.match(/^data:image\/(png|jpeg);base64,(.+)$/s)
  return match ? Buffer.from(match[2], 'base64') : null
}

/**
 * Loads a resident's receipt, or null when that ledger row is not theirs (so one resident can
 * never fetch another's receipt by guessing ids).
 */
export async function loadRentReceipt(residentId: string, rentPaymentId: string): Promise<ReceiptData | null> {
  const payment = await prisma.rentPayment.findUnique({ where: { id: rentPaymentId }, include: { resident: { include: { room: { include: { property: true } } } } } })
  if (!payment || payment.residentId !== residentId) return null
  // A month confirmed from the resident's own UPI report carries its reference; find that report.
  const report = payment.razorpayPaymentId ? null : await prisma.payment.findFirst({ where: { residentId, status: 'paid', razorpayQrId: null, rentMonths: { array_contains: [{ month: payment.month }] } }, orderBy: { createdAt: 'desc' }, select: { reference: true } })
  const { method, reference } = payment.razorpayPaymentId ? { method: 'Online payment (Razorpay)', reference: payment.razorpayPaymentId }
    : report ? { method: 'UPI transfer to property owner', reference: report.reference ? `UTR ${report.reference}` : null }
    : { method: 'Recorded by property owner', reference: null }
  const settings = await getSettings()
  const { resident } = payment
  return {
    number: receiptNumber(payment.id, payment.month),
    business: { name: settings.businessName, phone: settings.contactPhone, email: settings.contactEmail, logo: logoImage(settings.logoUrl) },
    resident: { name: displayName(resident.name), phone: resident.phone, email: resident.email, room: resident.room.number, property: resident.room.property.name, location: resident.room.property.location },
    month: payment.month,
    amount: payment.amount,
    paidAt: payment.paidAt,
    method,
    reference,
  }
}

/** Renders the receipt as a one-page A4 PDF laid out like an invoice. */
export function renderRentReceipt(receipt: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Rent receipt ${receipt.number}`, Author: receipt.business.name, Subject: `Rent for ${formatMonth(receipt.month)}` } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = 56
    const right = doc.page.width - 56
    const width = right - left
    const text = (value: string, x: number, y: number, options: { size?: number; bold?: boolean; color?: string; width?: number; align?: 'left' | 'right' | 'center'; spacing?: number; link?: string } = {}) => {
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size ?? 10).fillColor(options.color ?? colors.ink)
        .text(value, x, y, { width: options.width, align: options.align, characterSpacing: options.spacing, link: options.link, underline: Boolean(options.link), lineBreak: options.width !== undefined })
    }
    const label = (value: string, x: number, y: number, widthOrUndefined?: number, align?: 'left' | 'right') => text(value.toUpperCase(), x, y, { size: 7.5, bold: true, color: colors.muted, spacing: 0.9, width: widthOrUndefined, align })

    // Header band: brand on the left, document title and number on the right.
    doc.rect(0, 0, doc.page.width, 6).fill(colors.teal)
    let brandX = left
    if (receipt.business.logo) {
      try { doc.image(receipt.business.logo, left, 44, { fit: [120, 44] }); brandX = left + 132 } catch { brandX = left }
    }
    // Kept clear of the right-aligned title block, wrapping if the business name is long.
    const brandWidth = right - 190 - brandX
    text(receipt.business.name, brandX, 48, { size: 17, bold: true, width: brandWidth })
    const contact = [receipt.business.phone, receipt.business.email].filter(Boolean).join('   |   ')
    let contactY = doc.y + 4
    for (const line of [receipt.business.phone, receipt.business.email].filter((value): value is string => Boolean(value))) { text(line, brandX, contactY, { size: 9, color: colors.muted, width: brandWidth }); contactY = doc.y + 1 }
    const brandBottom = doc.y
    text('RENT RECEIPT', left, 46, { size: 18, bold: true, color: colors.teal, width, align: 'right', spacing: 1.2 })
    text(`Receipt no. ${receipt.number}`, left, 72, { size: 9, color: colors.muted, width, align: 'right' })
    text(`Issued ${formatDate(new Date())}`, left, 85, { size: 9, color: colors.muted, width, align: 'right' })
    // The divider sits below whichever side of the header ran longer (a long name wraps).
    const dividerY = Math.max(brandBottom, receipt.business.logo ? 92 : 98) + 18
    doc.moveTo(left, dividerY).lineTo(right, dividerY).lineWidth(1).strokeColor(colors.line).stroke()

    // Parties: who paid, and for which room.
    const column = (width - 24) / 2
    const partiesTop = dividerY + 20
    label('Received from', left, partiesTop)
    text(receipt.resident.name, left, partiesTop + 14, { size: 12, bold: true, width: column })
    let y = doc.y + 3
    for (const line of [receipt.resident.phone, receipt.resident.email].filter((value): value is string => Boolean(value))) { text(line, left, y, { size: 9.5, color: colors.muted, width: column }); y = doc.y + 2 }
    const partiesBottom = y
    const propertyX = left + column + 24
    label('Property', propertyX, partiesTop)
    text(receipt.resident.property, propertyX, partiesTop + 14, { size: 12, bold: true, width: column })
    text(`Room ${receipt.resident.room}`, propertyX, doc.y + 3, { size: 9.5, color: colors.muted, width: column })
    const link = mapLink(receipt.resident.location)
    if (link) text('View location on map', propertyX, doc.y + 2, { size: 9.5, color: colors.teal, width: column, link })
    else if (receipt.resident.location.trim()) text(receipt.resident.location.trim(), propertyX, doc.y + 2, { size: 9.5, color: colors.muted, width: column })
    y = Math.max(partiesBottom, doc.y) + 28

    // Line items: one rent month per receipt, then the total.
    const amountWidth = 130
    const periodX = left + width * 0.5
    doc.rect(left, y, width, 26).fill(colors.band)
    label('Description', left + 12, y + 9)
    label('Period', periodX, y + 9)
    label('Amount', right - amountWidth - 12, y + 9, amountWidth, 'right')
    y += 26
    text('Monthly rent', left + 12, y + 12, { size: 10.5 })
    text(formatMonth(receipt.month), periodX, y + 12, { size: 10.5 })
    text(formatInr(receipt.amount), right - amountWidth - 12, y + 12, { size: 10.5, width: amountWidth, align: 'right' })
    y += 38
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(colors.line).stroke()
    y += 14
    text('Total received', periodX, y + 4, { size: 11, bold: true })
    text(formatInr(receipt.amount), right - amountWidth - 12, y, { size: 16, bold: true, color: colors.teal, width: amountWidth, align: 'right' })
    // A "PAID" stamp beside the total makes the status obvious at a glance.
    doc.roundedRect(left, y - 4, 64, 26, 5).lineWidth(1.5).strokeColor(colors.teal).stroke()
    text('PAID', left, y + 3, { size: 12, bold: true, color: colors.teal, width: 64, align: 'center', spacing: 2 })
    y += 52

    // Payment details.
    const details: Array<[string, string]> = [['Payment method', receipt.method], ['Paid on', formatDate(receipt.paidAt)], ...(receipt.reference ? [['Reference', receipt.reference] as [string, string]] : [])]
    const boxHeight = 40 + details.length * 22
    doc.roundedRect(left, y, width, boxHeight, 8).fill(colors.tealSoft)
    label('Payment details', left + 16, y + 12)
    details.forEach(([name, value], index) => {
      const rowY = y + 30 + index * 22
      text(name, left + 16, rowY, { size: 10, color: colors.muted })
      text(value, left + 150, rowY, { size: 10, width: width - 166 })
    })

    // Footer, pinned to the bottom of the page.
    const footerY = doc.page.height - 86
    doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(1).strokeColor(colors.line).stroke()
    text('This is a computer-generated receipt and does not require a signature.', left, footerY + 14, { size: 8.5, color: colors.muted, width, align: 'center' })
    text(`Thank you. For any questions, contact ${receipt.business.name}${contact ? ` (${contact})` : ''}.`, left, footerY + 28, { size: 8.5, color: colors.muted, width, align: 'center' })
    doc.end()
  })
}
