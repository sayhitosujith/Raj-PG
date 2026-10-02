import type { ReactNode } from 'react'
import { Facebook, Instagram, Search } from 'lucide-react'
import { WhatsAppIcon } from './WhatsAppIcon'
import { bookingLink, bookingSourceLabels } from './booking'

type SharePlatform = 'whatsapp' | 'facebook' | 'instagram' | 'google'

// WhatsApp and Facebook have web share targets; Instagram and Google don't, so their tagged link
// is copied for the resident to paste (a story, a review reply, a search listing post).
const platforms: Array<{ key: SharePlatform; icon: ReactNode; shareUrl?: (link: string, text: string) => string }> = [
  { key: 'whatsapp', icon: <WhatsAppIcon size={15} />, shareUrl: (link, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}` },
  { key: 'facebook', icon: <Facebook size={15} />, shareUrl: (link) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}` },
  { key: 'instagram', icon: <Instagram size={15} /> },
  { key: 'google', icon: <Search size={15} /> },
]

/**
 * "Refer a friend" icons in the resident portal footer. Each shares the public booking link tagged
 * with its platform (`/book?from=…`), so the owner's booking requests show where a referral came from.
 */
export function ReferralShare({ businessName, onNotice }: { businessName: string; onNotice: (message: string) => void }) {
  const text = `Looking for a place to stay? Book a room at ${businessName}:`

  async function copyLink(platform: SharePlatform) {
    const link = bookingLink(platform)
    try { await navigator.clipboard.writeText(link); onNotice(`Link copied. Paste it on ${bookingSourceLabels[platform]} to refer a friend.`) } catch { onNotice(link) }
  }

  return (
    <span className="referral-share">
      Refer a friend
      {platforms.map(({ key, icon, shareUrl }) => {
        const label = bookingSourceLabels[key]
        return shareUrl
          ? <a key={key} className={`referral-icon is-${key}`} href={shareUrl(bookingLink(key), text)} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${label}`} title={`Share on ${label}`}>{icon}</a>
          : <button key={key} type="button" className={`referral-icon is-${key}`} aria-label={`Copy link for ${label}`} title={`Copy link for ${label}`} onClick={() => copyLink(key)}>{icon}</button>
      })}
    </span>
  )
}
