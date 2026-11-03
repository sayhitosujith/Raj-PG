import { useEffect, useState } from 'react'
import { describeVisit, type OwnerHousekeepingRequest } from './housekeeping'
import { identityDocumentName } from './identity'
import { formatMonth } from './rent'
import type { OwnerMaintenanceRequest } from './maintenance'
import type { Notice } from './NotificationBell'
import type { Resident } from './resident'
import { useRefreshSignal } from './useAutoRefresh'

const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** "Requested by Name · +91… · Room 103": who is asking, so the owner can reply without looking them up. */
function requester(resident: Pick<Resident, 'name' | 'phone' | 'room'> | undefined, fallbackName?: string, fallbackRoom?: string | null) {
  const name = resident?.name ?? fallbackName ?? 'A resident'
  const room = resident?.room ?? fallbackRoom
  return ['Requested by ' + name, resident?.phone, room && room !== '—' ? `Room ${room}` : null].filter(Boolean).join(' · ')
}

/**
 * The owner's notifications: everything a resident has asked for that is still waiting on the owner.
 * That covers move-out notices, account deletion requests, requests to join the food plan, ID
 * documents to verify, housekeeping visits and repairs, plus referral rewards granted (cancellable in
 * the resident's rent panel). Each request says who asked, with their phone and
 * room. Ids carry the request's state, so a fresh request shows up as unread even from the same
 * resident.
 */
export function buildOwnerNotices(residents: Resident[], housekeeping: OwnerHousekeepingRequest[], repairs: OwnerMaintenanceRequest[] | null, isSuperAdmin = true): Notice[] {
  const notices: Notice[] = []
  const byId = new Map(residents.map((resident) => [resident.id, resident]))
  for (const resident of residents) {
    if (!resident.active || resident.deletedAt) continue
    const by = requester(resident)
    if (resident.exitStatus === 'PENDING' && resident.exitDate) notices.push({ kind: 'Move-out', residentId: resident.id, id: `exit-${resident.id}-${resident.exitDate}`, title: `Move-out request for ${shortDate(resident.exitDate)}`, detail: by })
    // Only super admins can approve, so only they are told; receptionists see the pill on the resident.
    if (resident.approvalPending && isSuperAdmin) notices.push({ kind: 'Account', residentId: resident.id, id: `approval-${resident.id}`, title: `${resident.name} is waiting for your approval`, detail: `Added by a receptionist · ${by}` })
    if (resident.deletionRequestedAt) notices.push({ kind: 'Account', residentId: resident.id, id: `deletion-${resident.id}-${resident.deletionRequestedAt}`, title: 'Account deletion request', detail: by, at: resident.deletionRequestedAt })
    if (resident.foodRequestedAt && !resident.foodOpted) notices.push({ kind: 'Food', residentId: resident.id, id: `food-${resident.id}-${resident.foodRequestedAt}`, title: 'Wants to join the food plan', detail: by, at: resident.foodRequestedAt })
    for (const concession of resident.rentConcessions ?? []) notices.push({ kind: 'Reward', residentId: resident.id, id: `reward-${concession.id}`, title: `${resident.name} gets ${concession.percent}% off ${formatMonth(concession.month)} rent`, detail: concession.reason })
    if (resident.aadharStatus === 'PENDING') notices.push({ kind: 'ID check', residentId: resident.id, id: `id-${resident.id}-${resident.aadharSubmittedAt ?? ''}`, title: `${identityDocumentName(resident.nationality)} submitted for verification`, detail: by, at: resident.aadharSubmittedAt })
  }
  for (const request of housekeeping) {
    if (request.status !== 'REQUESTED') continue
    notices.push({ kind: 'Housekeeping', id: `housekeeping-${request.id}`, title: `Housekeeping · ${describeVisit(request)}`, detail: requester(byId.get(request.resident.id), request.resident.name, request.resident.room), at: request.createdAt })
  }
  for (const request of repairs ?? []) {
    if (request.status !== 'open') continue
    notices.push({ kind: 'Repair', id: `repair-${request.id}`, title: `Repair · ${request.title}`, detail: requester(request.resident ? byId.get(request.resident.id) : undefined, request.resident?.name, request.resident?.room), at: request.createdAt })
  }
  return notices
}

/** The owner's repair requests for their notifications, refreshed with the workspace; null until loaded or if it fails. */
export function useOwnerRepairs(refreshSignal: number) {
  const [repairs, setRepairs] = useState<OwnerMaintenanceRequest[] | null>(null)
  const load = () => fetch('/api/maintenance').then((response) => response.ok ? response.json() as Promise<OwnerMaintenanceRequest[]> : null).then((list) => { if (list) setRepairs(list) }, () => undefined)
  useEffect(() => { void load() }, [])
  useRefreshSignal(refreshSignal, () => { void load() })
  return repairs
}

/** A receptionist's change, as GET /api/staff-activity lists it. */
export type StaffActivity = { id: string; staffName: string; action: string; createdAt: string }

/**
 * The last week of receptionists' changes for a super admin's notifications, refreshed with the
 * workspace (and at once through live updates); empty for receptionists, who may not read them.
 */
export function useStaffActivity(refreshSignal: number, enabled: boolean) {
  const [activity, setActivity] = useState<StaffActivity[]>([])
  const load = () => { if (enabled) void fetch('/api/staff-activity').then((response) => response.ok ? response.json() as Promise<StaffActivity[]> : null).then((list) => { if (list) setActivity(list) }, () => undefined) }
  useEffect(() => { load() }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- reload when the role is known
  useRefreshSignal(refreshSignal, load)
  return enabled ? activity : []
}

/** Receptionists' changes as Team notifications: "Priya (receptionist)" over what they did. */
export const staffActivityNotices = (activity: StaffActivity[]): Notice[] => activity.map((item) => ({ kind: 'Team', id: `staff-${item.id}`, title: item.action, detail: `By ${item.staffName} (receptionist)`, at: item.createdAt }))
