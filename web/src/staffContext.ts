import { createContext, useContext } from 'react'

/**
 * Whether the signed-in staff member is a super admin, for components deep in the admin pages that
 * show or hide super-admin-only actions (approving new residents, verifying ID documents). App
 * provides it; the server enforces the same limits, so this only decides what is shown.
 */
const IsSuperAdminContext = createContext(true)
export const IsSuperAdminProvider = IsSuperAdminContext.Provider
export const useIsSuperAdmin = () => useContext(IsSuperAdminContext)
