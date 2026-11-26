import { useCallback, useEffect, useState } from 'react'
import { useRefreshSignal } from './useAutoRefresh'

/** The four reports on the super admins' Reports page; each maps to GET /api/reports/<kind>. */
export const reportKinds = [['rent', 'Rent & dues'], ['finance', 'Income vs expenses'], ['occupancy', 'Occupancy'], ['requests', 'Maintenance & housekeeping']] as const
export type ReportKind = (typeof reportKinds)[number][0]

/** Periods the backend accepts (it falls back to 6 for anything else). */
export const reportPeriods = [['3', 'Last 3 months'], ['6', 'Last 6 months'], ['12', 'Last 12 months']] as const

/** What every report is filtered by: how many months back, and one property or all (''). */
export type ReportFilter = { months: string; propertyId: string }

export type RentReport = {
  months: { month: string; collected: number; outstanding: number; expected: number }[]
  totals: { collected: number; outstanding: number; expected: number; owedNow: number }
  dues: { residentId: string; name: string; property: string; room: string; monthsOwed: string[]; overdueMonths: number; amountDue: number }[]
}

export type FinanceReport = {
  months: { month: string; rentReceived: number; otherIncome: number; income: number; expenses: number; profit: number }[]
  totals: { income: number; expenses: number; profit: number }
  expensesByCategory: Record<string, number>
  /** Expenses not linked to a property, left out when one property is chosen. */
  unassignedExpenses: number
}

export type OccupancyReport = {
  totals: { beds: number; taken: number; free: number; occupancy: number }
  byProperty: { propertyId: string; name: string; beds: number; taken: number; free: number; occupancy: number }[]
  bySharing: { beds: number; rooms: number; totalBeds: number; taken: number }[]
  months: { month: string; moveIns: number; moveOuts: number }[]
}

export type RequestsReport = {
  maintenance: { months: { month: string; raised: number; resolved: number }[]; open: number; averageDaysToResolve: number | null; byCategory: { category: string; raised: number; open: number }[] }
  housekeeping: { months: { month: string; requested: number; done: number; cancelled: number }[]; open: number }
}

/**
 * Loads one report for the filter, reloading when the filter changes or the dashboard's refresh
 * signal fires. Keeps the last data while a reload runs, so changing a filter does not flash empty.
 */
export function useReport<T>(kind: ReportKind, filter: ReportFilter, refreshSignal: number) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const query = new URLSearchParams({ months: filter.months, ...(filter.propertyId ? { propertyId: filter.propertyId } : {}) }).toString()
  const load = useCallback(() => fetch(`/api/reports/${kind}?${query}`)
    .then((response) => response.ok ? response.json() as Promise<T> : Promise.reject(new Error(`Report ${kind} failed`)))
    .then((report) => { setData(report); setFailed(false) }, () => setFailed(true)), [kind, query])
  useEffect(() => { void load() }, [load])
  useRefreshSignal(refreshSignal, () => { void load() })
  return { data, failed }
}

const csvCell = (value: string | number) => {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Saves rows as a CSV file. The byte-order mark makes Excel read it as UTF-8, so the ₹ sign and
 * non-English names survive; amounts are written as plain numbers so they stay summable.
 */
export function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const blob = new Blob([`﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** "Oct" from "2026-10", with the year added for January and the first month, so a 12-month axis reads unambiguously. */
export function shortMonth(month: string, isFirst: boolean) {
  const [year, number] = month.split('-').map(Number)
  const name = new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'short' })
  return isFirst || number === 1 ? `${name} ${String(year).slice(2)}` : name
}

/** "₹1.2L" / "₹45k" / "₹900" for chart axes, where full figures would crowd; tooltips and tables show the exact amount. */
export function compactRupees(amount: number) {
  if (amount >= 1_00_000) return `₹${Number((amount / 1_00_000).toFixed(1))}L`
  if (amount >= 1_000) return `₹${Number((amount / 1_000).toFixed(1))}k`
  return `₹${amount}`
}
