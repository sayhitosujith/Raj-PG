import { useState } from 'react'
import { CountriesReportPanel, FinanceReportPanel, OccupancyReportPanel, RentReportPanel, RequestsReportPanel } from './ReportPanels'
import { reportKinds, reportPeriods, type ReportKind } from './reports'

type PropertyOption = { id: string; name: string }

const panels = { rent: RentReportPanel, finance: FinanceReportPanel, occupancy: OccupancyReportPanel, requests: RequestsReportPanel, countries: CountriesReportPanel } satisfies Record<ReportKind, unknown>

/**
 * "Reports" (super admins only): rent & dues, income vs expenses, occupancy, and maintenance &
 * housekeeping, over the last 3, 6 or 12 months for all properties or one; and residents by country,
 * today's snapshot on a world map (so the period select is hidden on that tab). The menu item and this
 * view are shown only to super admins, and the server refuses /api/reports to anyone else (staffGuard).
 */
export function ReportsView({ properties: allProperties, refreshSignal, onBack }: { properties: Array<{ id?: string; name: string }>; refreshSignal: number; onBack: () => void }) {
  // The dashboard's fallback data can hold properties without an id; they cannot be filtered on.
  const properties = allProperties.filter((property): property is PropertyOption => Boolean(property.id))
  const [kind, setKind] = useState<ReportKind>('rent')
  const [months, setMonths] = useState('6')
  const [propertyId, setPropertyId] = useState('')
  const Panel = panels[kind]
  const propertyName = properties.find((property) => property.id === propertyId)?.name
  // Download names say what they cover, e.g. rent-dues-last-6-months-premium-stay.csv.
  const fileTag = [`last-${months}-months`, propertyName?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')].filter(Boolean).join('-')

  return (
    <section className="workspace-view reports-view">
      <div className="workspace-view-heading"><div><p className="eyebrow">Manage</p><h2>Reports</h2><p>Rent, money, occupancy, requests and where residents come from, with downloads for Excel.</p></div><div className="view-actions"><button className="secondary-button" onClick={onBack}>Back to dashboard</button></div></div>
      <div className="filter-tabs reports-tabs" role="tablist" aria-label="Choose a report">
        {reportKinds.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={kind === value} className={kind === value ? 'is-active' : ''} onClick={() => setKind(value)}>{label}</button>)}
      </div>
      <div className="residents-toolbar">
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} aria-label="Property"><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        {/* Residents by country is today's snapshot, so a period would change nothing there. */}
        {kind !== 'countries' && <select value={months} onChange={(event) => setMonths(event.target.value)} aria-label="Period">{reportPeriods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
      </div>
      <div role="tabpanel" className="report-body">
        <Panel key={kind} filter={{ months, propertyId }} refreshSignal={refreshSignal} fileTag={fileTag} />
      </div>
    </section>
  )
}
