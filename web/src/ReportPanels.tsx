import { lazy, Suspense, useState } from 'react'
import { countryName } from './countries'
import { Flag } from './CountryFlag'
import { expenseCategoryLabels, type ExpenseCategory } from './finance'
import { InlineLoader } from './Loader'
import { maintenanceCategoryLabels } from './maintenance'
import { DonutChart } from './DonutChart'
import { HorizontalBarChart } from './HorizontalBarChart'
import { MonthlyChart } from './MonthlyChart'
import { formatMonth, formatRupees } from './rent'
import { ReportPending, ReportStats, ReportTable, percentOf } from './ReportParts'
import { compactRupees, useReport, type CountriesReport, type FinanceReport, type OccupancyReport, type ReportFilter, type RentReport, type RequestsReport } from './reports'

// The map and its world outlines (~100 KB) load only when this tab is opened, not with the dashboard.
const WorldMap = lazy(() => import('./WorldMap').then((module) => ({ default: module.WorldMap })))

/**
 * The report bodies on the Reports page. Each loads its own data for the shared filter and
 * shows headline figures, charts suited to its figures (a donut for parts of a whole, lines for a trend,
 * horizontal bars for categories and properties, bars by month) and the detail tables, each with its CSV.
 * `fileTag` (e.g. "last-6-months") is appended to download names so saved files say what they cover.
 */
type PanelProps = { filter: ReportFilter; refreshSignal: number; fileTag: string }

const count = (value: number) => value.toLocaleString('en-IN')
const monthColumn = { label: 'Month', value: (row: { month: string }) => formatMonth(row.month) }

/** Rent expected, collected and still owed per month, and everyone who owes rent now. */
export function RentReportPanel({ filter, refreshSignal, fileTag }: PanelProps) {
  const { data, failed } = useReport<RentReport>('rent', filter, refreshSignal)
  if (!data) return <ReportPending failed={failed} />
  const months = data.months.map((row) => row.month)
  return (
    <>
      <ReportStats stats={[
        { label: 'Rent expected', value: formatRupees(data.totals.expected), note: 'for the months in this period' },
        { label: 'Collected', value: formatRupees(data.totals.collected), note: `${percentOf(data.totals.collected, data.totals.expected)} of expected` },
        { label: 'Still owed for these months', value: formatRupees(data.totals.outstanding), tone: data.totals.outstanding ? 'is-loss' : undefined },
        { label: 'Owed now, all months', value: formatRupees(data.totals.owedNow), note: `${data.dues.length} resident${data.dues.length === 1 ? '' : 's'}, late fees included`, tone: data.totals.owedNow ? 'is-loss' : undefined },
      ]} />
      <div className="report-chart-pair is-donut-first">
        <DonutChart title="Collected vs still owed" format={formatRupees} centre={{ value: percentOf(data.totals.collected, data.totals.expected), label: 'collected' }}
          slices={[{ label: 'Collected', value: data.totals.collected }, { label: 'Still owed', value: data.totals.outstanding }]} />
        <MonthlyChart title="Rent for each month: collected and still owed" months={months} stacked format={formatRupees} axisFormat={compactRupees}
          series={[{ label: 'Collected', values: data.months.map((row) => row.collected) }, { label: 'Still owed', values: data.months.map((row) => row.outstanding) }]} />
      </div>
      <ReportTable title="Month by month" fileName={`rent-by-month-${fileTag}`} rows={data.months} rowKey={(row) => row.month} empty="No months in this period."
        columns={[monthColumn,
          { label: 'Expected (₹)', value: (row) => row.expected, cell: (row) => formatRupees(row.expected), numeric: true },
          { label: 'Collected (₹)', value: (row) => row.collected, cell: (row) => formatRupees(row.collected), numeric: true },
          { label: 'Still owed (₹)', value: (row) => row.outstanding, cell: (row) => formatRupees(row.outstanding), numeric: true },
          { label: 'Collected %', value: (row) => percentOf(row.collected, row.expected), numeric: true }]} />
      <ReportTable title="Who owes rent now" fileName={`rent-dues-${fileTag}`} rows={data.dues} rowKey={(row) => row.residentId} empty="Nobody owes rent right now."
        columns={[
          { label: 'Resident', value: (row) => row.name },
          { label: 'Property', value: (row) => row.property || '—' },
          { label: 'Room', value: (row) => row.room || '—' },
          { label: 'Months owed', value: (row) => row.monthsOwed.map(formatMonth).join('; ') },
          { label: 'Overdue months', value: (row) => row.overdueMonths, numeric: true },
          { label: 'Amount due (₹)', value: (row) => row.amountDue, cell: (row) => formatRupees(row.amountDue), numeric: true }]} />
      <p className="report-note">Expected rent is what each month was billed: rent paid for it plus what current residents still owe for it. Moved-out residents settle their dues at move-out, so they are not listed here.</p>
    </>
  )
}

/** Money in and out per month (as the Payments page counts it), with expenses by category. */
export function FinanceReportPanel({ filter, refreshSignal, fileTag }: PanelProps) {
  const { data, failed } = useReport<FinanceReport>('finance', filter, refreshSignal)
  if (!data) return <ReportPending failed={failed} />
  const isLoss = data.totals.profit < 0
  const categories = (Object.keys(expenseCategoryLabels) as ExpenseCategory[]).map((category) => ({ category, amount: data.expensesByCategory[category] ?? 0 }))
  return (
    <>
      <ReportStats stats={[
        { label: 'Income', value: formatRupees(data.totals.income), note: 'rent received + other income' },
        { label: 'Expenses', value: formatRupees(data.totals.expenses) },
        { label: isLoss ? 'Loss' : 'Profit', value: `${isLoss ? '−' : ''}${formatRupees(Math.abs(data.totals.profit))}`, tone: isLoss ? 'is-loss' : 'is-profit' },
      ]} />
      <MonthlyChart kind="line" title="Income and expenses by month" months={data.months.map((row) => row.month)} format={formatRupees} axisFormat={compactRupees}
        series={[{ label: 'Income', values: data.months.map((row) => row.income) }, { label: 'Expenses', values: data.months.map((row) => row.expenses) }]} />
      <HorizontalBarChart title="Expenses by category" segments={['Spent']} format={formatRupees} empty="No expenses recorded in this period."
        total={(row) => `${formatRupees(row.values[0])} · ${percentOf(row.values[0], data.totals.expenses)}`}
        rows={categories.filter((row) => row.amount > 0).map((row) => ({ key: row.category, label: expenseCategoryLabels[row.category], values: [row.amount] }))} />
      <ReportTable title="Month by month" fileName={`income-expenses-${fileTag}`} rows={data.months} rowKey={(row) => row.month} empty="No months in this period."
        columns={[monthColumn,
          { label: 'Rent received (₹)', value: (row) => row.rentReceived, cell: (row) => formatRupees(row.rentReceived), numeric: true },
          { label: 'Other income (₹)', value: (row) => row.otherIncome, cell: (row) => formatRupees(row.otherIncome), numeric: true },
          { label: 'Income (₹)', value: (row) => row.income, cell: (row) => formatRupees(row.income), numeric: true },
          { label: 'Expenses (₹)', value: (row) => row.expenses, cell: (row) => formatRupees(row.expenses), numeric: true },
          { label: 'Profit / loss (₹)', value: (row) => row.profit, cell: (row) => <span className={row.profit < 0 ? 'is-loss' : undefined}>{row.profit < 0 ? '−' : ''}{formatRupees(Math.abs(row.profit))}</span>, numeric: true }]} />
      <ReportTable title="Expenses by category" fileName={`expenses-by-category-${fileTag}`} rows={categories} rowKey={(row) => row.category} empty="No expense categories."
        columns={[
          { label: 'Category', value: (row) => expenseCategoryLabels[row.category] },
          { label: 'Amount (₹)', value: (row) => row.amount, cell: (row) => formatRupees(row.amount), numeric: true },
          { label: 'Share', value: (row) => percentOf(row.amount, data.totals.expenses), numeric: true }]} />
      {filter.propertyId && data.unassignedExpenses > 0 && <p className="report-note">{formatRupees(data.unassignedExpenses)} of expenses in this period are not linked to any property, so they are left out here. They appear under All properties.</p>}
      <p className="report-note">Money is counted in the month it was received or spent, as on the Payments page, so rent paid in advance counts when it arrived.</p>
    </>
  )
}

/** Beds taken and free per property and sharing type, with move-ins and move-outs per month. */
export function OccupancyReportPanel({ filter, refreshSignal, fileTag }: PanelProps) {
  const { data, failed } = useReport<OccupancyReport>('occupancy', filter, refreshSignal)
  if (!data) return <ReportPending failed={failed} />
  const moveIns = data.months.reduce((sum, row) => sum + row.moveIns, 0)
  const moveOuts = data.months.reduce((sum, row) => sum + row.moveOuts, 0)
  return (
    <>
      <ReportStats stats={[
        { label: 'Occupancy now', value: `${data.totals.occupancy}%`, note: `${count(data.totals.taken)} of ${count(data.totals.beds)} beds` },
        { label: 'Free beds', value: count(data.totals.free) },
        { label: 'Moved in', value: count(moveIns), note: 'in this period' },
        { label: 'Moved out', value: count(moveOuts), note: 'in this period' },
      ]} />
      <div className="report-chart-pair is-donut-first">
        <DonutChart title="Beds taken vs free" format={count} centre={{ value: `${data.totals.occupancy}%`, label: 'occupied' }}
          slices={[{ label: 'Taken', value: data.totals.taken }, { label: 'Free', value: data.totals.free }]} />
        <HorizontalBarChart title="Occupancy by property" segments={['Taken', 'Free']} format={count} fillRow empty="No properties yet."
          total={(row) => `${percentOf(row.values[0], row.values[0] + row.values[1])} · ${count(row.values[0])}/${count(row.values[0] + row.values[1])}`}
          rows={data.byProperty.map((row) => ({ key: row.propertyId, label: row.name, values: [row.taken, row.free] }))} />
      </div>
      <MonthlyChart title="Move-ins and move-outs by month" months={data.months.map((row) => row.month)} format={count} wholeNumbers
        series={[{ label: 'Moved in', values: data.months.map((row) => row.moveIns) }, { label: 'Moved out', values: data.months.map((row) => row.moveOuts) }]} />
      <ReportTable title="Beds by property, right now" fileName={`occupancy-by-property-${fileTag}`} rows={data.byProperty} rowKey={(row) => row.propertyId} empty="No properties yet."
        columns={[
          { label: 'Property', value: (row) => row.name },
          { label: 'Beds', value: (row) => row.beds, numeric: true },
          { label: 'Taken', value: (row) => row.taken, numeric: true },
          { label: 'Free', value: (row) => row.free, numeric: true },
          { label: 'Occupancy %', value: (row) => row.occupancy, cell: (row) => <span className="report-meter"><span aria-hidden="true"><i style={{ width: `${row.occupancy}%` }} /></span>{row.occupancy}%</span>, numeric: true }]} />
      <ReportTable title="Rooms by sharing type" fileName={`occupancy-by-sharing-${fileTag}`} rows={data.bySharing} rowKey={(row) => String(row.beds)} empty="No rooms have been set up yet."
        columns={[
          { label: 'Sharing', value: (row) => row.beds === 1 ? 'Single' : `${row.beds} sharing` },
          { label: 'Rooms', value: (row) => row.rooms, numeric: true },
          { label: 'Beds', value: (row) => row.totalBeds, numeric: true },
          { label: 'Taken', value: (row) => row.taken, numeric: true },
          { label: 'Occupancy %', value: (row) => percentOf(row.taken, row.totalBeds), numeric: true }]} />
      <p className="report-note">Occupancy is as of today: past occupancy is not stored, so the monthly view shows movement instead. Rooms a property declares but has not set up count as single beds in the totals, as on the dashboard.</p>
    </>
  )
}

/** Repairs raised and resolved, cleaning requests handled, and repairs by category. */
export function RequestsReportPanel({ filter, refreshSignal, fileTag }: PanelProps) {
  const { data, failed } = useReport<RequestsReport>('requests', filter, refreshSignal)
  if (!data) return <ReportPending failed={failed} />
  const { maintenance, housekeeping } = data
  const months = maintenance.months.map((row) => row.month)
  // Both lists cover the same months in the same order (the backend builds them from one scope).
  const combined = maintenance.months.map((row, index) => ({ ...row, ...housekeeping.months[index] }))
  const days = maintenance.averageDaysToResolve
  const openOf = (category: string) => maintenance.byCategory.find((row) => row.category === category)?.open ?? 0
  const categoryName = (category: string) => maintenanceCategoryLabels[category as keyof typeof maintenanceCategoryLabels] ?? category
  return (
    <>
      <ReportStats stats={[
        { label: 'Repairs open now', value: count(maintenance.open), tone: maintenance.open ? 'is-loss' : undefined },
        { label: 'Average time to fix', value: days === null ? '—' : `${days} day${days === 1 ? '' : 's'}`, note: 'repairs resolved in this period' },
        { label: 'Cleaning requests open', value: count(housekeeping.open) },
      ]} />
      <div className="report-chart-pair">
        <MonthlyChart title="Repairs raised and resolved" months={months} format={count} wholeNumbers
          series={[{ label: 'Raised', values: maintenance.months.map((row) => row.raised) }, { label: 'Resolved', values: maintenance.months.map((row) => row.resolved) }]} />
        <MonthlyChart title="Cleaning requested and done" months={months} format={count} wholeNumbers
          series={[{ label: 'Requested', values: housekeeping.months.map((row) => row.requested) }, { label: 'Done', values: housekeeping.months.map((row) => row.done) }]} />
      </div>
      <HorizontalBarChart title="Repairs by category" segments={['Raised in period']} format={count} empty="No repairs raised in this period."
        total={(row) => `${count(row.values[0])} raised${openOf(row.key) ? ` · ${count(openOf(row.key))} open` : ''}`}
        rows={maintenance.byCategory.filter((row) => row.raised > 0).map((row) => ({ key: row.category, label: categoryName(row.category), values: [row.raised] }))} />
      <ReportTable title="Month by month" fileName={`maintenance-housekeeping-${fileTag}`} rows={combined} rowKey={(row) => row.month} empty="No months in this period."
        columns={[monthColumn,
          { label: 'Repairs raised', value: (row) => row.raised, numeric: true },
          { label: 'Repairs resolved', value: (row) => row.resolved, numeric: true },
          { label: 'Cleaning requested', value: (row) => row.requested, numeric: true },
          { label: 'Cleaning done', value: (row) => row.done, numeric: true },
          { label: 'Cleaning cancelled', value: (row) => row.cancelled, numeric: true }]} />
      <ReportTable title="Repairs by category" fileName={`repairs-by-category-${fileTag}`} rows={maintenance.byCategory} rowKey={(row) => row.category} empty="No repair categories."
        columns={[
          { label: 'Category', value: (row) => categoryName(row.category) },
          { label: 'Raised in period', value: (row) => row.raised, numeric: true },
          { label: 'Open now', value: (row) => row.open, numeric: true }]} />
    </>
  )
}

/**
 * Where current residents come from: a world map shaded by nationality, the countries ranked, and the
 * residents themselves. Picking a country (on the map or in the list) narrows the residents table to it.
 */
export function CountriesReportPanel({ filter, refreshSignal }: PanelProps) {
  const { data, failed } = useReport<CountriesReport>('countries', filter, refreshSignal)
  const [picked, setPicked] = useState<string | null>(null)
  if (!data) return <ReportPending failed={failed} />
  // A pick that the property filter has since emptied falls back to everyone.
  const selected = picked && data.countries.some((country) => country.code === picked) ? picked : null
  const counts = Object.fromEntries(data.countries.map((country) => [country.code, country.residents.length]))
  const top = data.countries[0]
  const fromAbroad = data.countries.filter((country) => country.code !== 'IN').reduce((sum, country) => sum + country.residents.length, 0)
  const residents = data.countries.filter((country) => !selected || country.code === selected).flatMap((country) => country.residents.map((resident) => ({ ...resident, country: country.code })))
  return (
    <>
      <ReportStats stats={[
        { label: 'Residents', value: count(data.total), note: 'living at the properties now' },
        { label: 'Countries', value: count(data.countries.length) },
        { label: 'Most common', value: top ? countryName(top.code) : '—', note: top ? `${count(top.residents.length)} of ${count(data.total)} residents` : undefined },
        { label: 'From outside India', value: count(fromAbroad), note: fromAbroad ? 'passport and visa holders' : undefined },
      ]} />
      <figure className="report-chart">
        <figcaption className="report-chart-head"><strong>Residents by nationality</strong><small className="report-map-hint">Click a country to see its residents</small></figcaption>
        <Suspense fallback={<InlineLoader label="Loading the map…" />}><WorldMap counts={counts} selected={selected} onSelect={setPicked} /></Suspense>
      </figure>
      <section className="report-section">
        <div className="report-section-head"><h3>Countries</h3>{selected && <button type="button" className="text-link" onClick={() => setPicked(null)}>Show all countries</button>}</div>
        {top ? (
          <ul className="report-countries">
            {data.countries.map((country) => (
              <li key={country.code}><button type="button" className={selected === country.code ? 'is-active' : ''} aria-pressed={selected === country.code} onClick={() => setPicked(selected === country.code ? null : country.code)}>
                <Flag code={country.code} /><span className="report-hbar-label">{countryName(country.code)}</span>
                <span className="report-hbar-track" aria-hidden="true"><i className="report-series-0" style={{ width: `${(country.residents.length / top.residents.length) * 100}%` }} /></span>
                <b className="report-hbar-value">{count(country.residents.length)} · {percentOf(country.residents.length, data.total)}</b>
              </button></li>
            ))}
          </ul>
        ) : <p className="report-empty">No residents live at the properties right now.</p>}
      </section>
      <ReportTable title={selected ? `Residents from ${countryName(selected)}` : 'All residents'} fileName={`residents-by-country${selected ? `-${selected.toLowerCase()}` : ''}`} rows={residents} rowKey={(row) => row.id} empty="No residents to show."
        columns={[
          { label: 'Resident', value: (row) => row.name },
          { label: 'Country', value: (row) => countryName(row.country), cell: (row) => <span className="country-label"><Flag code={row.country} />{countryName(row.country)}</span> },
          { label: 'Property', value: (row) => row.property || '—' },
          { label: 'Room', value: (row) => row.room || '—' }]} />
    </>
  )
}
