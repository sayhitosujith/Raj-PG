import { createContext, useContext } from 'react'

/**
 * Whether the resident portal is being shown to a super admin acting as the resident (see
 * ActAsResident.tsx) rather than to the resident. App provides it around the portal. Only screens that
 * would otherwise force the viewer to answer for the resident (the meal choice window) read it.
 */
const IsActingAsResidentContext = createContext(false)
export const IsActingAsResidentProvider = IsActingAsResidentContext.Provider
export const useIsActingAsResident = () => useContext(IsActingAsResidentContext)
