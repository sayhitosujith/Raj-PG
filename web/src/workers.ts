/** What a property worker does; mirrors the API's WorkerRole. */
export type WorkerRole = 'COOK' | 'SECURITY' | 'HOUSEKEEPING' | 'ELECTRICIAN' | 'PLUMBER'

/** Someone who works at a property (they never sign in); the phone is E.164 when present. */
export type Worker = { id: string; name: string; role: WorkerRole; phone: string | null }

/** Roles in the order the Staff panel lists them. */
export const workerRoles: Array<{ value: WorkerRole; label: string }> = [
  { value: 'HOUSEKEEPING', label: 'Housekeeping' },
  { value: 'COOK', label: 'Cook' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'ELECTRICIAN', label: 'Electrician' },
  { value: 'PLUMBER', label: 'Plumber' },
]
