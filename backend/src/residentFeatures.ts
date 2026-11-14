/**
 * Resident features a super admin can switch off in Settings > Resident features (the same keys as
 * web/src/residentFeatures.ts). Nine of them (faqs to laundry) are also the Feature banners keys.
 */
export const residentFeatureKeys = ['tier', 'faqs', 'passkeys', 'whatsapp', 'email', 'photos', 'housekeeping', 'repairs', 'referral', 'laundry', 'amenities', 'meals', 'wifi', 'holidays', 'footer', 'exitPg', 'houseRules', 'payments', 'weather'] as const
export type ResidentFeature = (typeof residentFeatureKeys)[number]
export type ResidentFeatureSwitches = Record<ResidentFeature, boolean>

const isFeature = (key: string): key is ResidentFeature => (residentFeatureKeys as readonly string[]).includes(key)

/**
 * Whether a feature is on, from the stored settings value. Only an explicit `false` turns it off, so a
 * missing key (a feature added after the setting was saved) or an unreadable value leaves it on.
 */
export function isResidentFeatureOn(stored: unknown, feature: ResidentFeature) {
  return !(stored && typeof stored === 'object' && (stored as Record<string, unknown>)[feature] === false)
}

/** Every feature with its on/off state, for the portal and the Settings form. */
export function residentFeatureSwitches(stored: unknown): ResidentFeatureSwitches {
  return Object.fromEntries(residentFeatureKeys.map((feature) => [feature, isResidentFeatureOn(stored, feature)])) as ResidentFeatureSwitches
}

/**
 * The switches sent from Settings, as the value to store: only the features switched off. Unknown
 * features and non-boolean values are refused rather than ignored, so a typo cannot silently do nothing.
 */
export function parseResidentFeatures(input: unknown): { data: Partial<Record<ResidentFeature, false>> } | { error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { error: 'Resident features must be a list of features.' }
  const off: Partial<Record<ResidentFeature, false>> = {}
  for (const [feature, on] of Object.entries(input)) {
    if (!isFeature(feature)) return { error: `Unknown feature: ${feature}.` }
    if (typeof on !== 'boolean') return { error: 'Each resident feature must be on or off.' }
    if (!on) off[feature] = false
  }
  return { data: off }
}
