/**
 * Resident features a super admin can switch off in Settings > Resident features (the same keys as
 * backend/src/residentFeatures.ts). Off hides the feature in the portal and the API refuses it.
 */
export const residentFeatures = [
  { key: 'tier', label: 'Member tier', detail: 'Silver, Gold or Pearl under the resident’s name, and its FAQ' },
  { key: 'faqs', label: 'FAQs', detail: 'The FAQs card in Help and on WhatsApp' },
  { key: 'passkeys', label: 'Face ID / fingerprint sign-in', detail: 'Setting it up, and signing in with it' },
  { key: 'whatsapp', label: 'WhatsApp updates', detail: 'Rent reminders, receipts and notices on WhatsApp' },
  { key: 'email', label: 'Email updates', detail: 'Optional emails; receipts and alerts still go' },
  { key: 'photos', label: 'Photos', detail: 'The property photo gallery' },
  { key: 'housekeeping', label: 'Housekeeping', detail: 'Booking room cleaning' },
  { key: 'repairs', label: 'Complaints & repairs', detail: 'Reporting problems, in the portal and on WhatsApp' },
  { key: 'referral', label: 'Refer a friend', detail: 'Share links, and rewards for new referrals' },
  { key: 'laundry', label: 'Laundry', detail: 'The laundry shop card in Help' },
  { key: 'amenities', label: 'Amenities', detail: 'The amenity chips on Home' },
  { key: 'meals', label: 'Meals', detail: 'Menu, meal choices, ratings, late meals and joining the food plan' },
  { key: 'wifi', label: 'Wi-Fi details', detail: 'Network name and password, in the portal and on WhatsApp' },
  { key: 'holidays', label: 'Upcoming holidays', detail: 'The holidays list on Home' },
  { key: 'footer', label: 'Footer', detail: 'Policy links, Refer a friend and "In association with" at the bottom' },
  { key: 'exitPg', label: 'Exit PG', detail: 'Giving move-out notice in the app' },
  { key: 'houseRules', label: 'House rules', detail: 'The House rules card in Help' },
  { key: 'payments', label: 'Online payment', detail: 'Paying rent in the app; what is owed and receipts still show' },
  { key: 'weather', label: 'Weather', detail: 'The weather on Home; the phone’s location is not asked for' },
] as const

export type ResidentFeature = (typeof residentFeatures)[number]['key']

/** On unless explicitly switched off, so an older server (or a feature added later) leaves it showing. */
export const isFeatureOn = (switches: Partial<Record<ResidentFeature, boolean>> | undefined, feature: ResidentFeature) => switches?.[feature] !== false
