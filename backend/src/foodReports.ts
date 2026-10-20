import PDFDocument from 'pdfkit'
import type { FoodSummaryData } from './food.js'
import { displayName } from './names.js'
import { documentColors as colors } from './receipts.js'

/**
 * The Kitchen page's Headcount and Feedback panels as A4 PDFs, laid out like the rent receipts: a
 * teal band, the business and property, a title, then a table. Built from the same summary the page
 * shows, so a printed sheet never disagrees with the screen.
 */
export type ReportHeader = { business: string; property: string; generatedAt: Date }

const timeZone = 'Asia/Kolkata'
const left = 48
const bottomMargin = 64
const mealLabels: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
const dietLabels: Record<string, string> = { VEG: 'Veg', NON_VEG: 'Non-veg' }
// The Indian food marks' colours: green for veg, brown-red for non-veg.
const dietColors: Record<string, string> = { VEG: '#15803d', NON_VEG: '#a3341c' }

// Dates arrive as "2026-10-16" (property-local days stored at UTC midnight), so they are read in UTC.
const dayLabel = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const stamp = (date: Date) => date.toLocaleString('en-IN', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

type Doc = InstanceType<typeof PDFDocument>
type Column = { title: string; width: number; align?: 'left' | 'right' | 'center' }

/** A new A4 document that resolves to its bytes once `draw` has finished with it. */
function renderPdf(title: string, header: ReportHeader, draw: (doc: Doc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `${title} · ${header.property}`, Author: header.business } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    draw(doc)
    // Page numbers and the generated time on every page, once the page count is known.
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(pages.start + i)
      doc.font('Helvetica').fontSize(8).fillColor(colors.muted)
        .text(`${header.business} · generated ${stamp(header.generatedAt)}`, left, doc.page.height - 40, { lineBreak: false })
        .text(`Page ${i + 1} of ${pages.count}`, left, doc.page.height - 40, { width: doc.page.width - left * 2, align: 'right', lineBreak: false })
    }
    doc.end()
  })
}

/** The band, the business and property, the title and a one-line summary; returns the y below them. */
function drawHeading(doc: Doc, header: ReportHeader, title: string, summary: string) {
  doc.rect(0, 0, doc.page.width, 6).fill(colors.teal)
  doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.muted).text(`${header.business}  ·  ${header.property}`.toUpperCase(), left, 34, { characterSpacing: 0.8, lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(22).fillColor(colors.ink).text(title, left, 50, { lineBreak: false })
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text(summary, left, 80, { width: doc.page.width - left * 2 })
  return doc.y + 18
}

/** A table header row in the receipts' muted label style; returns the y below it. */
function drawColumnTitles(doc: Doc, columns: Column[], y: number) {
  let x = left
  doc.rect(left, y - 6, columns.reduce((sum, column) => sum + column.width, 0), 22).fill(colors.band)
  for (const column of columns) {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colors.muted).text(column.title.toUpperCase(), x + 6, y, { width: column.width - 12, align: column.align, characterSpacing: 0.8, lineBreak: false })
    x += column.width
  }
  return y + 22
}

/**
 * One table row, taller when a cell wraps. Moves to a new page (repeating the column titles) when
 * the row would run into the footer. Returns the y below the row.
 */
function drawRow(doc: Doc, columns: Column[], cells: Array<{ text: string; bold?: boolean; color?: string }>, y: number) {
  const height = Math.max(...cells.map((cell, i) => doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).heightOfString(cell.text || ' ', { width: columns[i].width - 12 }))) + 12
  if (y + height > doc.page.height - bottomMargin) {
    doc.addPage()
    doc.rect(0, 0, doc.page.width, 6).fill(colors.teal)
    y = drawColumnTitles(doc, columns, 40)
  }
  let x = left
  cells.forEach((cell, i) => {
    doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(cell.color ?? colors.ink).text(cell.text, x + 6, y + 6, { width: columns[i].width - 12, align: columns[i].align })
    x += columns[i].width
  })
  doc.moveTo(left, y + height).lineTo(x, y + height).lineWidth(0.6).strokeColor(colors.line).stroke()
  return y + height
}

/**
 * Headcount: today's meals only, eating and not eating (not opting in counts as not eating). The kitchen
 * prints it for the day it cooks; tomorrow's numbers still change until 9 pm, so they stay on screen.
 */
export function renderHeadcountPdf(summary: FoodSummaryData, header: ReportHeader): Promise<Buffer> {
  const residents = summary.residentList
  return renderPdf('Headcount', header, (doc) => {
    let y = drawHeading(doc, header, 'Headcount', `${summary.residents} active ${summary.residents === 1 ? 'resident' : 'residents'} on food. Residents opt in by 9 pm the day before; anyone who has not opted in is not eating.`)
    const today = summary.headcounts[0]
    if (!today) return
    // Veg and non-veg split the eaters; anyone eating with no diet set is in Eating but in neither.
    const columns: Column[] = [{ title: 'Meal', width: 145 }, { title: 'Eating', width: 90, align: 'right' }, { title: 'Veg', width: 85, align: 'right' }, { title: 'Non-veg', width: 90, align: 'right' }, { title: 'Not eating', width: 89, align: 'right' }]
    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.teal).text(`Today · ${dayLabel(today.date)}`, left, y, { lineBreak: false })
    y = drawColumnTitles(doc, columns, y + 24)
    for (const meal of today.meals) {
      y = drawRow(doc, columns, [{ text: mealLabels[meal.meal] ?? meal.meal, bold: true }, { text: String(meal.eating), bold: true }, { text: String(meal.veg), color: dietColors.VEG }, { text: String(meal.nonVeg), color: dietColors.NON_VEG }, { text: String(meal.notEating), color: colors.muted }], y)
    }
    doc.y = y

    // Who the numbers are: everyone on the food plan, so the kitchen can check or call a resident.
    if (!residents.length) return
    y = doc.y + 30
    if (y > doc.page.height - bottomMargin - 80) { doc.addPage(); doc.rect(0, 0, doc.page.width, 6).fill(colors.teal); y = 40 }
    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.teal).text(`Residents on food (${residents.length})`, left, y, { lineBreak: false })
    const residentColumns: Column[] = [{ title: 'Name', width: 200 }, { title: 'Phone', width: 145 }, { title: 'Room', width: 70 }, { title: 'Diet', width: 84 }]
    y = drawColumnTitles(doc, residentColumns, y + 24)
    for (const resident of residents) {
      y = drawRow(doc, residentColumns, [{ text: displayName(resident.name), bold: true }, { text: resident.phone || '—', color: resident.phone ? colors.ink : colors.muted }, { text: resident.room || '—' }, { text: resident.diet ? dietLabels[resident.diet] : 'Not set', bold: Boolean(resident.diet), color: resident.diet ? dietColors[resident.diet] : colors.muted }], y)
    }
  })
}

/** Feedback: every rating from the last `days` days, newest first, with the comment in full. */
export function renderFeedbackPdf(summary: FoodSummaryData, header: ReportHeader, days: number): Promise<Buffer> {
  const liked = summary.feedback.filter((item) => item.liked).length
  const notLiked = summary.feedback.length - liked
  return renderPdf('Meal feedback', header, (doc) => {
    let y = drawHeading(doc, header, 'Meal feedback', summary.feedback.length ? `Last ${days} days: ${summary.feedback.length} ${summary.feedback.length === 1 ? 'rating' : 'ratings'}, ${liked} liked, ${notLiked} not liked.` : `No feedback in the last ${days} days.`)
    if (!summary.feedback.length) return
    const columns: Column[] = [{ title: 'Date', width: 100 }, { title: 'Meal', width: 66 }, { title: 'Resident', width: 112 }, { title: 'Rating', width: 66 }, { title: 'Comment', width: 155 }]
    y = drawColumnTitles(doc, columns, y)
    for (const item of summary.feedback) {
      y = drawRow(doc, columns, [
        { text: dayLabel(item.date) },
        { text: mealLabels[item.meal] ?? item.meal },
        { text: displayName(item.residentName) },
        { text: item.liked ? 'Liked' : 'Not liked', bold: true, color: item.liked ? colors.teal : '#b4231a' },
        { text: item.comment ?? '', color: item.comment ? colors.ink : colors.muted },
      ], y)
    }
  })
}

// How each answer reads and is coloured on the residents sheet: words, since the PDF fonts have no ticks.
const answerCells: Record<'EATING' | 'NOT_EATING', { text: string; bold?: boolean; color: string }> = {
  EATING: { text: 'Yes', bold: true, color: dietColors.VEG },
  NOT_EATING: { text: 'No', color: colors.muted },
}

/**
 * Residents on food: who opted for each meal, today and tomorrow. Per day, a table of every resident on
 * the food plan with their answer for breakfast, lunch and dinner, then the names eating each meal, so
 * the kitchen can tick people off. Tomorrow's answers can still change until 9 pm, which the sheet says.
 */
export function renderResidentsPdf(summary: FoodSummaryData, header: ReportHeader): Promise<Buffer> {
  const residents = summary.residentList
  const meals = ['breakfast', 'lunch', 'dinner'] as const
  return renderPdf('Residents on food', header, (doc) => {
    let y = drawHeading(doc, header, 'Residents on food', residents.length ? `${residents.length} on the food plan. Yes = opted in for the meal; No = not opted in (no food served).` : 'Nobody is on the food plan yet.')
    if (!residents.length) return
    const columns: Column[] = [{ title: 'Name', width: 150 }, { title: 'Room', width: 50 }, { title: 'Diet', width: 64 }, { title: 'Breakfast', width: 77 }, { title: 'Lunch', width: 77 }, { title: 'Dinner', width: 81 }]
    const days = [{ key: 'today', label: 'Today', date: summary.headcounts[0]?.date }, { key: 'tomorrow', label: 'Tomorrow', date: summary.headcounts[1]?.date }] as const
    days.forEach(({ key, label, date }, index) => {
      if (index > 0) {
        y += 26
        if (y > doc.page.height - bottomMargin - 120) { doc.addPage(); doc.rect(0, 0, doc.page.width, 6).fill(colors.teal); y = 40 }
      }
      doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.teal).text(`${label}${date ? ` · ${dayLabel(date)}` : ''}${key === 'tomorrow' ? '  (can still change until 9 pm today)' : ''}`, left, y, { lineBreak: false })
      y = drawColumnTitles(doc, columns, y + 24)
      for (const resident of residents) {
        const answers = resident[key]
        y = drawRow(doc, columns, [
          { text: displayName(resident.name), bold: true },
          { text: resident.room || '—' },
          { text: resident.diet ? dietLabels[resident.diet] : 'Not set', color: resident.diet ? dietColors[resident.diet] : colors.muted },
          ...meals.map((meal) => answerCells[answers[meal]]),
        ], y)
      }
      // The names per meal, so whoever serves can check people off without reading across the table.
      doc.font('Helvetica').fontSize(9.5).fillColor(colors.ink)
      doc.y = y + 8
      for (const meal of meals) {
        const eating = residents.filter((resident) => resident[key][meal] === 'EATING').map((resident) => displayName(resident.name))
        doc.font('Helvetica-Bold').text(`${mealLabels[meal]} (${eating.length}): `, left, doc.y + 2, { continued: true }).font('Helvetica').fillColor(eating.length ? colors.ink : colors.muted).text(eating.length ? eating.join(', ') : 'nobody', { width: doc.page.width - left * 2 }).fillColor(colors.ink)
      }
      y = doc.y
    })
  })
}
