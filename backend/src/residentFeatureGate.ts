import type { NextFunction, Request, Response } from 'express'
import { isResidentFeatureOn, type ResidentFeature } from './residentFeatures.js'
import { getSettings } from './settings.js'

/** The 403 body for a switched-off feature; the portal treats code FEATURE_OFF like any other refusal. */
export const featureOffError = { error: 'This feature is switched off by your property owner.', code: 'FEATURE_OFF' } as const

/** Whether a resident feature is switched on right now (settings are cached, so this is cheap). */
export async function isFeatureOn(feature: ResidentFeature) {
  return isResidentFeatureOn((await getSettings()).residentFeatures, feature)
}

/**
 * Route guard for a resident feature: answers 403 FEATURE_OFF while it is switched off in Settings, so a
 * portal tab opened before the switch, or a direct API call, cannot keep using it. Kept apart from
 * residentFeatures.ts so settings.ts can import the parser without importing itself back.
 */
export function requireResidentFeature(feature: ResidentFeature) {
  return async (_request: Request, response: Response, next: NextFunction) => {
    try {
      if (await isFeatureOn(feature)) { next(); return }
      response.status(403).json(featureOffError)
    } catch (error) {
      console.error('Feature check failed:', error)
      response.status(503).json({ error: 'Resident portal is temporarily unavailable.' })
    }
  }
}
