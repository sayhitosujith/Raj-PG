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
const teal = '#167c70'
const muted = '#6b7a76'

const formatInr = (amount: number) => `INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { timeZone, day: 'numeric', month: 'long', year: 'numeric' })
function formatMonth(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-IN', { timeZone, month: 'long', year: 'numeric' })
}

/** A stable, human-readable receipt number derived from the ledger row. */
export const receiptNumber = (rentPaymentId: string, month: string) => `RC-${month.replace('-', '')}-${rentPaymentId.slice(-6).toUpperCase()}`

type ReceiptData = {
  number: string
  business: { name: string; phone: string | null; email: string | null }
  resident: { name: string; phone: string | null; email: string | null; room: string; property: string; location: string }
  month: string
  amount: number
  paidAt: Date
  method: string
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
  const method = payment.razorpayPaymentId ? `Paid online (Razorpay ${payment.razorpayPaymentId})`
    : report ? `UPI to property owner${report.reference ? ` · UTR ${report.reference}` : ''}`
    : 'Recorded by property owner'
  const settings = await getSettings()
  const { resident } = payment
  return {
    number: receiptNumber(payment.id, payment.month),
    business: { name: settings.businessName, phone: settings.contactPhone, email: settings.contactEmail },
    resident: { name: resident.name, phone: resident.phone, email: resident.email, room: resident.room.number, property: resident.room.property.name, location: resident.room.property.location },
    month: payment.month,
    amount: payment.amount,
    paidAt: payment.paidAt,
    method,
  }
}

/** Renders the receipt as a one-page A5 PDF. */
export function renderRentReceipt(receipt: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40, info: { Title: `Rent receipt ${receipt.number}`, Author: receipt.business.name } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const width = doc.page.width - 80
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1f2d2b').text(receipt.business.name)
    const contact = [receipt.business.phone, receipt.business.email].filter(Boolean).join(' · ')
    if (contact) doc.font('Helvetica').fontSize(9).fillColor(muted).text(contact)
    doc.moveDown(1.2)
    doc.font('Helvetica-Bold').fontSize(11).fillColor(teal).text('RENT RECEIPT', { characterSpacing: 1.5 })
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`Receipt no. ${receipt.number}`)
    doc.moveDown(1)

    const field = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(8).fillColor(muted).text(label.toUpperCase(), { characterSpacing: 0.8 })
      doc.font('Helvetica').fontSize(11).fillColor('#1f2d2b').text(value)
      doc.moveDown(0.5)
    }
    field('Received from', receipt.resident.name)
    field('Property', `${receipt.resident.property}, ${receipt.resident.location} · Room ${receipt.resident.room}`)
    field('Rent for', formatMonth(receipt.month))
    field('Paid on', formatDate(receipt.paidAt))
    field('Payment', receipt.method)

    doc.moveDown(0.5)
    const boxTop = doc.y
    doc.roundedRect(40, boxTop, width, 52, 6).fillAndStroke('#e8f3f0', '#cfe5df')
    doc.font('Helvetica').fontSize(8).fillColor(muted).text('AMOUNT RECEIVED', 54, boxTop + 10, { characterSpacing: 0.8 })
    doc.font('Helvetica-Bold').fontSize(18).fillColor(teal).text(formatInr(receipt.amount), 54, boxTop + 22)
    doc.y = boxTop + 70
    doc.x = 40

    doc.font('Helvetica').fontSize(8).fillColor(muted).text(`Payment confirmed and recorded by ${receipt.business.name}. Generated on ${formatDate(new Date())}.`, { width })
    doc.end()
  })
}
