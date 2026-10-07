import PDFDocument from 'pdfkit'
import { formatMonthLabel } from './dates.js'
import { prisma } from './db.js'
import { displayName } from './names.js'
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

/** Owners may paste a map link as the location; that is a link, not an address to print. */
const mapLink = (location: string) => (/^https?:\/\//i.test(location.trim()) ? location.trim() : null)

/** A stable, human-readable receipt number derived from the ledger row. */
export const receiptNumber = (rentPaymentId: string, month: string) => `RC-${month.replace('-', '')}-${rentPaymentId.slice(-6).toUpperCase()}`

type ReceiptData = {
  number: string
  business: { name: string; phone: string | null; email: string | null }
  /** The resident's property photo, shown at the top left when there is one. */
  propertyPhoto: Buffer | null
  /** The owner's UPI ID the money was sent to, for a UPI transfer; null otherwise. */
  upi: { id: string } | null
  resident: { name: string; phone: string | null; email: string | null; room: string; property: string; location: string }
  month: string
  amount: number
  paidAt: Date
  method: string
  reference: string | null
  /** A concession on this month (e.g. "10% referral reward"), shown as its own detail line. */
  discount: string | null
}

// An uploaded photo is a PNG/JPEG data URL (resized in the browser); anything else is skipped.
function dataUrlImage(dataUrl: string | null) {
  const match = dataUrl?.match(/^data:image\/(png|jpeg);base64,(.+)$/s)
  return match ? Buffer.from(match[2], 'base64') : null
}

/**
 * The property photo as PNG/JPEG bytes for the PDF, or null. An uploaded photo is a data URL; a
 * pasted one is a web address, fetched here (JPEG requested, since PDFs cannot embed WebP or AVIF).
 * A slow or odd image just leaves that corner empty.
 */
async function propertyPhoto(imageUrl: string | null | undefined) {
  if (!imageUrl) return null
  if (imageUrl.startsWith('data:')) return dataUrlImage(imageUrl)
  try {
    const response = await fetch(imageUrl, { headers: { Accept: 'image/jpeg,image/png' }, signal: AbortSignal.timeout(4000) })
    const type = response.headers.get('content-type') ?? ''
    return response.ok && /image\/(jpeg|png)/.test(type) ? Buffer.from(await response.arrayBuffer()) : null
  } catch {
    return null
  }
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
  const concession = await prisma.rentConcession.findFirst({ where: { residentId, month: payment.month, status: 'ACTIVE' }, select: { percent: true, reason: true } })
  const discount = concession ? `${concession.percent}% off${concession.reason ? ` · ${concession.reason}` : ''}` : null
  const { resident } = payment
  return {
    number: receiptNumber(payment.id, payment.month),
    // The property's manager number (Edit property) is who residents should call about their rent;
    // the business-wide number covers properties without one and moved-out residents.
    business: { name: settings.businessName, phone: resident.room?.property.ownerPhone || settings.contactPhone, email: settings.contactEmail },
    propertyPhoto: await propertyPhoto(resident.room?.property.imageUrl),
    upi: report && settings.upiId ? { id: settings.upiId } : null,
    resident: { name: displayName(resident.name), phone: resident.phone, email: resident.email, room: resident.room?.number ?? '—', property: resident.room?.property.name ?? resident.movedOutFrom ?? '', location: resident.room?.property.location ?? '' },
    month: payment.month,
    amount: payment.amount,
    paidAt: payment.paidAt,
    method,
    reference,
    discount,
  }
}

/**
 * A round "PAID" seal centred on (cx, cy), drawn like a rubber stamp: two rings, the word across the
 * middle between two rules, and the payment date under it, tilted a little and slightly see-through
 * so it reads as stamped on rather than printed.
 */
function drawPaidSeal(doc: PDFKit.PDFDocument, cx: number, cy: number, radius: number, paidOn: string) {
  doc.save()
  doc.rotate(-14, { origin: [cx, cy] })
  doc.opacity(0.88)
  doc.circle(cx, cy, radius).lineWidth(2.4).strokeColor(colors.teal).stroke()
  doc.circle(cx, cy, radius - 5).lineWidth(0.9).strokeColor(colors.teal).stroke()
  const ruleHalf = radius - 14
  doc.moveTo(cx - ruleHalf, cy - 15).lineTo(cx + ruleHalf, cy - 15).lineWidth(0.9).strokeColor(colors.teal).stroke()
  doc.moveTo(cx - ruleHalf, cy + 13).lineTo(cx + ruleHalf, cy + 13).lineWidth(0.9).strokeColor(colors.teal).stroke()
  doc.font('Helvetica-Bold').fontSize(19).fillColor(colors.teal).text('PAID', cx - radius, cy - 10, { width: radius * 2, align: 'center', characterSpacing: 2.5, lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(6.5).text(paidOn.toUpperCase(), cx - radius, cy + 18, { width: radius * 2, align: 'center', characterSpacing: 0.6, lineBreak: false })
  doc.restore()
}

/** Renders the receipt as a one-page A4 PDF laid out like an invoice. */
export function renderRentReceipt(receipt: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Rent receipt ${receipt.number}`, Author: receipt.business.name, Subject: `Rent for ${formatMonthLabel(receipt.month)}` } })
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

    // Header band: the property photo on the left, document title and number on the right.
    doc.rect(0, 0, doc.page.width, 6).fill(colors.teal)
    // The resident's property photo top left when there is one (a rounded square, centre-cropped);
    // the property's contact details are in the Property column below.
    const photoSize = 60
    let brandArtBottom = 98
    if (receipt.propertyPhoto) {
      try {
        doc.save()
        doc.roundedRect(left, 40, photoSize, photoSize, 10).clip()
        doc.image(receipt.propertyPhoto, left, 40, { cover: [photoSize, photoSize], align: 'center', valign: 'center' })
        doc.restore()
        brandArtBottom = 40 + photoSize
      } catch {
        doc.restore()
      }
    }
    text('RENT RECEIPT', left, 46, { size: 18, bold: true, color: colors.teal, width, align: 'right', spacing: 1.2 })
    text(`Receipt no. ${receipt.number}`, left, 72, { size: 9, color: colors.muted, width, align: 'right' })
    text(`Issued ${formatDate(new Date())}`, left, 85, { size: 9, color: colors.muted, width, align: 'right' })
    // The divider sits below the photo when there is one.
    const dividerY = brandArtBottom + 18
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
    // Who to contact about this property: its manager number (or the business phone) and email.
    for (const line of [receipt.business.phone, receipt.business.email].filter((value): value is string => Boolean(value))) text(line, propertyX, doc.y + 2, { size: 9.5, color: colors.muted, width: column })
    const link = mapLink(receipt.resident.location)
    if (link) text('View location on map', propertyX, doc.y + 2, { size: 9.5, color: colors.teal, width: column, link })
    else if (receipt.resident.location.trim()) text(receipt.resident.location.trim(), propertyX, doc.y + 2, { size: 9.5, color: colors.muted, width: column })
    y = Math.max(partiesBottom, doc.y) + 28

    // Where a UPI transfer was received: the owner's UPI ID, paid for this property, in a strip above the items.
    if (receipt.upi) {
      const stripHeight = 44
      doc.roundedRect(left, y, width, stripHeight, 6).lineWidth(1).strokeColor(colors.line).stroke()
      label('Received via UPI', left + 14, y + 10)
      text('UPI ID', left + 14, y + 25, { size: 9.5, color: colors.muted })
      text(receipt.upi.id, left + 60, y + 25, { size: 9.5, bold: true, width: column - 60 })
      const paidTo = receipt.resident.property || receipt.business.name
      text('Paid to', propertyX, y + 25, { size: 9.5, color: colors.muted })
      text(paidTo, propertyX + 46, y + 25, { size: 9.5, bold: true, width: column - 46 })
      y += stripHeight + 20
    }

    // Line items: one rent month per receipt, then the total.
    const amountWidth = 130
    const periodX = left + width * 0.5
    doc.rect(left, y, width, 26).fill(colors.band)
    label('Description', left + 12, y + 9)
    label('Period', periodX, y + 9)
    label('Amount', right - amountWidth - 12, y + 9, amountWidth, 'right')
    y += 26
    text('Monthly rent', left + 12, y + 12, { size: 10.5 })
    text(formatMonthLabel(receipt.month), periodX, y + 12, { size: 10.5 })
    text(formatInr(receipt.amount), right - amountWidth - 12, y + 12, { size: 10.5, width: amountWidth, align: 'right' })
    y += 38
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(colors.line).stroke()
    y += 14
    text('Total received', periodX, y + 4, { size: 11, bold: true })
    text(formatInr(receipt.amount), right - amountWidth - 12, y, { size: 16, bold: true, color: colors.teal, width: amountWidth, align: 'right' })
    y += 52

    // Payment details.
    const details: Array<[string, string]> = [['Payment method', receipt.method], ['Paid on', formatDate(receipt.paidAt)], ...(receipt.discount ? [['Discount', receipt.discount] as [string, string]] : []), ...(receipt.reference ? [['Reference', receipt.reference] as [string, string]] : [])]
    const boxHeight = 40 + details.length * 22
    doc.roundedRect(left, y, width, boxHeight, 8).fill(colors.tealSoft)
    label('Payment details', left + 16, y + 12)
    const sealRadius = 46
    details.forEach(([name, value], index) => {
      const rowY = y + 30 + index * 22
      text(name, left + 16, rowY, { size: 10, color: colors.muted })
      // Values stop short of the seal on the right.
      text(value, left + 150, rowY, { size: 10, width: width - 166 - sealRadius * 2 - 24 })
    })
    drawPaidSeal(doc, right - sealRadius - 24, y + Math.max(boxHeight, sealRadius * 2 + 16) / 2, sealRadius, formatDate(receipt.paidAt))

    // Footer, pinned to the bottom of the page.
    const footerY = doc.page.height - 86
    const contact = [receipt.business.phone, receipt.business.email].filter(Boolean).join('   |   ')
    doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(1).strokeColor(colors.line).stroke()
    text('This is a computer-generated receipt and does not require a signature.', left, footerY + 14, { size: 8.5, color: colors.muted, width, align: 'center' })
    text(`Thank you. For any questions, contact ${receipt.resident.property || receipt.business.name}${contact ? ` (${contact})` : ''}.`, left, footerY + 28, { size: 8.5, color: colors.muted, width, align: 'center' })
    doc.end()
  })
}
