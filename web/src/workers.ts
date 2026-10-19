/** What a property worker does; mirrors the API's WorkerRole. */
export type WorkerRole = 'HEAD_COOK' | 'HELPING_COOK' | 'HOUSEKEEPING' | 'SECURITY' | 'ELECTRICIAN' | 'PLUMBER'

/**
 * Someone who works at a property (they never sign in). The phone is E.164 and the date of joining an
 * ISO date; either is null only for staff added before it was asked for. The photo is fetched by version.
 */
export type Worker = { id: string; name: string; role: WorkerRole; phone: string | null; joinedOn: string | null; photoVersion: number | null }

/** Roles in the order the Staff panel lists them. */
export const workerRoles: Array<{ value: WorkerRole; label: string }> = [
  { value: 'HEAD_COOK', label: 'Head cook' },
  { value: 'HELPING_COOK', label: 'Helping cook' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'ELECTRICIAN', label: 'Electrician' },
  { value: 'PLUMBER', label: 'Plumber' },
]

/** The URL of a worker's photo, or null when they have none. */
export const workerPhotoUrl = (propertyId: string, worker: Worker) => worker.photoVersion ? `/api/properties/${propertyId}/workers/${worker.id}/photo?v=${worker.photoVersion}` : null
