import { createContext, useContext, useState } from 'react'

/** The banners a resident feature can carry. */
export type FeatureBadgeKind = 'NEW' | 'SOON' | 'BETA'

/** Resident features the owner can put a banner on (the same keys as backend/src/settings.ts). */
export const featureBadgeFeatures = [
  { key: 'faqs', label: 'FAQs' },
  { key: 'passkeys', label: 'Face ID / fingerprint sign-in' },
  { key: 'whatsapp', label: 'WhatsApp updates' },
  { key: 'email', label: 'Email updates' },
  { key: 'photos', label: 'Photos' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'repairs', label: 'Complaints & repairs' },
  { key: 'referral', label: 'Refer a friend' },
] as const
export type FeatureKey = (typeof featureBadgeFeatures)[number]['key']

/** Each banner's name in Settings, and on its corner ribbon (short, to fit). */
export const featureBadgeLabels: Record<FeatureBadgeKind, { setting: string; ribbon: string }> = {
  NEW: { setting: 'New', ribbon: 'New' },
  SOON: { setting: 'Coming soon', ribbon: 'Soon' },
  BETA: { setting: 'Beta', ribbon: 'Beta' },
}

/** The owner's banners for the resident portal; ResidentPortal provides them from the workspace settings. */
const FeatureBadgesContext = createContext<Partial<Record<string, FeatureBadgeKind>>>({})
export const FeatureBadgesProvider = FeatureBadgesContext.Provider

const seenPrefix = 'staynest-seen:'

/**
 * The banner a feature shows right now, split by how it is drawn, the same way on every card: New and
 * Coming soon as a corner `ribbon`, Beta as a small `tag` beside the title. Plus `markSeen` for when
 * the resident uses the feature: "New" lasts only until then on this device (remembered in local
 * storage; if storage is unavailable it shows again next visit); "Coming soon" and "Beta" stay until
 * the owner removes them.
 */
export function useFeatureBadge(feature: FeatureKey) {
  const kind = useContext(FeatureBadgesContext)[feature] ?? null
  const key = seenPrefix + feature
  const [isSeen, setIsSeen] = useState(() => { try { return window.localStorage.getItem(key) === '1' } catch { return false } })
  function markSeen() {
    if (kind !== 'NEW' || isSeen) return
    setIsSeen(true)
    try { window.localStorage.setItem(key, '1') } catch { /* shows again next visit */ }
  }
  const shown = kind === 'NEW' && isSeen ? null : kind
  return { ribbon: shown === 'BETA' ? null : shown, tag: shown === 'BETA' ? shown : null, markSeen }
}

/** A New or Coming soon banner across a card's top-left corner; the card needs the `has-ribbon` class (see App.css). */
export function FeatureRibbon({ badge }: { badge: FeatureBadgeKind }) {
  return <span className={`new-ribbon is-${badge.toLowerCase()}`}>{featureBadgeLabels[badge].ribbon}</span>
}

/** A Beta banner as a small inline tag beside a feature's title. */
export function FeatureTag({ badge }: { badge: FeatureBadgeKind }) {
  return <span className="beta-tag">{featureBadgeLabels[badge].setting}</span>
}
