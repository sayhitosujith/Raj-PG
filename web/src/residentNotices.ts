import { useEffect, useState } from 'react'
import type { ExitNotice } from './ExitPg'
import { maintenanceStatusLabels, type MaintenanceRequest } from './maintenance'
import type { Notice } from './NotificationBell'
import { formatMonth, formatRupees, ordinal, type RentSummary } from './rent'
import { useRefreshSignal } from './useAutoRefresh'

/** What the resident's notifications are built from: data the portal already loads. */
export type NoticeSources = {
  announcements: Array<{ id: string; title: string; message: string; createdAt: string }> | null
  rent: RentSummary
  exit: ExitNotice
  deletionDeclinedAt?: string | null
  /** The owner's last decision on the resident's food request. */
  foodDecidedAt?: string | null
  foodApproved?: boolean | null
  /** When the property's weekly menu last changed (only sent to residents on the food plan). */
  menuUpdatedAt?: string | null
  /** What changed, one line per meal. */
  menuChanges?: string | null
  deletionDeclineReason?: string | null
  repairs: MaintenanceRequest[] | null
}

const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The resident's notifications: owner announcements, rent that is due or overdue, referral rewards, the owner's
 * decisions on their move-out and account deletion requests, and progress on their repair
 * requests. Each id encodes the state it describes, so a change shows up as a new unread notice.
 */
export function buildResidentNotices({ announcements, rent, exit, deletionDeclinedAt, deletionDeclineReason, foodDecidedAt, foodApproved, menuUpdatedAt, menuChanges, repairs }: NoticeSources): Notice[] {
  const notices: Notice[] = []
  for (const item of announcements ?? []) notices.push({ kind: 'Announcement', id: `announcement-${item.id}`, title: item.title, detail: item.message, at: item.createdAt })
  if (rent.monthlyRent && rent.state === 'LOCK_DUE') notices.push({ kind: 'Rent', id: `rent-overdue-${rent.overdueMonths.join(',')}`, title: `Rent overdue · ${formatRupees(rent.amountDue)}`, detail: 'Pay now to keep using the app.' })
  else if (rent.monthlyRent && rent.outstandingMonths.length) notices.push({ kind: 'Rent', id: `rent-due-${rent.outstandingMonths.join(',')}`, title: `Rent due · ${formatRupees(rent.amountDue)}`, detail: `Due by the ${ordinal(rent.dueDay)} of the month.` })
  for (const concession of rent.concessions ?? []) notices.push({ kind: 'Reward', id: `reward-${concession.month}-${concession.percent}`, title: `You earned ${concession.percent}% off your ${formatMonth(concession.month)} rent`, detail: concession.reason })
  if (exit.status === 'APPROVED' && exit.date) notices.push({ kind: 'Move-out', id: `exit-approved-${exit.date}`, title: `Move-out approved for ${longDate(exit.date)}` })
  if (exit.status === 'DECLINED') notices.push({ kind: 'Move-out', id: `exit-declined-${exit.date ?? ''}`, title: 'Your move-out request was declined' })
  if (menuUpdatedAt) notices.push({ kind: 'Food', id: `menu-updated-${menuUpdatedAt}`, title: 'The weekly menu was updated', detail: menuChanges ?? 'Open Weekly menu on Home to see what is cooking.', at: menuUpdatedAt })
  if (foodDecidedAt) notices.push({ kind: 'Food', id: `food-decision-${foodDecidedAt}`, title: foodApproved ? 'Your food plan is approved' : 'Your food request was declined', detail: foodApproved ? 'Meals are on from today. Your rent follows the with-food rate.' : 'Ask your property owner if you have questions.', at: foodDecidedAt })
  if (deletionDeclinedAt) notices.push({ kind: 'Account', id: `deletion-declined-${deletionDeclinedAt}`, title: 'Your account deletion request was declined', detail: deletionDeclineReason, at: deletionDeclinedAt })
  for (const request of repairs ?? []) {
    if (request.status === 'open' && !request.ownerNote) continue
    notices.push({ kind: 'Repair', id: `repair-${request.id}-${request.status}-${request.updatedAt}`, title: `"${request.title}" is ${maintenanceStatusLabels[request.status].toLowerCase()}`, detail: request.ownerNote ? `From your property owner: ${request.ownerNote}` : null, at: request.updatedAt })
  }
  return notices
}

/** The resident's repair requests for their notifications, refreshed with the rest of the portal; null until loaded, if it fails, or while repairs are switched off (`enabled` false, nothing is fetched). */
export function useRepairRequests(refreshSignal: number, enabled = true) {
  const [repairs, setRepairs] = useState<MaintenanceRequest[] | null>(null)
  const load = () => !enabled ? Promise.resolve() : fetch('/api/resident-portal/maintenance').then((response) => response.ok ? response.json() as Promise<MaintenanceRequest[]> : null).then((list) => { if (list) setRepairs(list) }, () => undefined)
  useEffect(() => { void load() }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- refetch only when repairs are switched on or off
  useRefreshSignal(refreshSignal, () => { void load() })
  return enabled ? repairs : null
}
