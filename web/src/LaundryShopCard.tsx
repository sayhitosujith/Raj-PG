import { Clock, ExternalLink, Shirt } from 'lucide-react'
import type { LaundryShop } from './workspaceSettings'

/** The link's site name for the button when the owner gave no shop name: "quickwash.in" from "https://www.quickwash.in/book". */
const siteName = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

/**
 * Laundry on the resident's Help tab: the shop the owner set in Settings, its timings, and a button to
 * its website or booking page (opened in a new tab, as it is another site). Only shown when the owner
 * has set at least one detail.
 */
export function LaundryShopCard({ shop }: { shop: LaundryShop }) {
  return (
    <section className="workspace-view laundry-shop-card">
      <div className="workspace-view-heading"><div><h2>Laundry</h2><p>Where to get your clothes washed.</p></div></div>
      <div className="laundry-shop-body">
        <span className="laundry-shop-icon" aria-hidden="true"><Shirt size={20} /></span>
        <div className="laundry-shop-details">
          {shop.name && <strong>{shop.name}</strong>}
          {shop.hours && <span className="laundry-shop-hours"><Clock size={14} aria-hidden="true" /> {shop.hours}</span>}
          {shop.url && <a className="primary-button laundry-shop-link" href={shop.url} target="_blank" rel="noopener noreferrer">{shop.name ? 'Open website' : `Open ${siteName(shop.url)}`} <ExternalLink size={14} aria-hidden="true" /></a>}
        </div>
      </div>
    </section>
  )
}
