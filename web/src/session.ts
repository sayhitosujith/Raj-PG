import type { SuperAdmin } from './superAdmin'

/** Who is signed in, as returned by both POST /api/auth/login and GET /api/auth/session. */
export type SessionResponse = { role: 'SUPER_ADMIN'; admin: SuperAdmin } | { role: 'RESIDENT' }
