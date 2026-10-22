import type { ReactNode } from 'react'
import { Clock, ExternalLink, Shirt } from 'lucide-react'
import { FeatureRibbon, FeatureTag, useFeatureBadge } from './FeatureBadges'
import type { LaundryShop } from './workspaceSettings'

/**
 * Laundry on the resident's Help tab: the shop the owner set in Settings and its timings, as one compact
 * row built from the FAQs card's parts so the two line up. With a website the whole row opens it in a
 * new tab (it is another site); without one it is plain text. Only shown when the owner set something.
 * Carries the owner's Laundry banner (Settings > Feature banners) like the FAQs card; "New" goes once tapped.
 */
export function LaundryShopCard({ shop }: { shop: LaundryShop }) {
  const { ribbon, tag, markSeen } = useFeatureBadge('laundry')
  const body: ReactNode = <>
    {ribbon && <FeatureRibbon badge={ribbon} />}
    <span className="faq-card-icon" aria-hidden="true"><Shirt size={20} /></span>
    <span className="faq-card-copy">
      <strong>Laundry{tag && <FeatureTag badge={tag} />}</strong>
      {shop.name && <small className="laundry-shop-name">{shop.name}</small>}
      {shop.hours && <small className="laundry-shop-hours"><Clock size={12} aria-hidden="true" /> {shop.hours}</small>}
    </span>
    {shop.url && <ExternalLink size={18} aria-hidden="true" />}
  </>
  return (
    <section className="workspace-view resident-faqs">
      {shop.url
        ? <a className="faq-card" href={shop.url} target="_blank" rel="noopener noreferrer" onClick={markSeen} aria-label={`Laundry: open ${shop.name ?? 'the laundry shop'}'s website in a new tab`}>{body}</a>
        : <div className="faq-card" onClick={markSeen}>{body}</div>}
    </section>
  )
}
