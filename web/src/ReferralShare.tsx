import type { ReactNode } from 'react'
import { Facebook, Instagram } from 'lucide-react'
import { WhatsAppIcon } from './WhatsAppIcon'
import { bookingLink, bookingSourceLabels } from './booking'

// The Google "G" in one colour (currentColor), like the other share icons: lucide ships no brand logos.
const GoogleMark = () => <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12.24 10.29v3.6h5.08c-.22 1.3-1.53 3.82-5.08 3.82-3.06 0-5.55-2.53-5.55-5.65s2.49-5.65 5.55-5.65c1.74 0 2.9.74 3.57 1.38l2.43-2.34C16.68 3.99 14.66 3 12.24 3 7.27 3 3.24 7.03 3.24 12s4.03 9 9 9c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.14-1.49z" /></svg>

type SharePlatform = 'whatsapp' | 'facebook' | 'instagram' | 'google'

// WhatsApp and Facebook have web share targets; Instagram and Google don't, so their tagged link
// is copied for the resident to paste (a story, a review reply, a search listing post).
const platforms: Array<{ key: SharePlatform; icon: ReactNode; shareUrl?: (link: string, text: string) => string }> = [
  { key: 'whatsapp', icon: <WhatsAppIcon size={15} />, shareUrl: (link, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}` },
  { key: 'facebook', icon: <Facebook size={15} />, shareUrl: (link) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}` },
  { key: 'instagram', icon: <Instagram size={15} /> },
  { key: 'google', icon: <GoogleMark /> },
]

/**
 * "Refer a friend" icons in the resident portal footer. Each shares the public booking link tagged
 * with its platform and the resident's referral code (`/book?from=…&ref=…`), so the owner sees where a
 * referral came from and who sent it, and the resident earns a reward when their friend joins and pays.
 */
export function ReferralShare({ businessName, referralCode, onNotice }: { businessName: string; /** The resident's code, so a friend who joins earns them a reward. */ referralCode?: string | null; onNotice: (message: string) => void }) {
  const text = `Looking for a place to stay? Book a room at ${businessName}:`

  async function copyLink(platform: SharePlatform) {
    const link = bookingLink(platform, referralCode)
    try { await navigator.clipboard.writeText(link); onNotice(`Link copied. Paste it on ${bookingSourceLabels[platform]} to refer a friend.`) } catch { onNotice(link) }
  }

  return (
    <span className="referral-share">
      Refer a friend
      {platforms.map(({ key, icon, shareUrl }) => {
        const label = bookingSourceLabels[key]
        return shareUrl
          ? <a key={key} className={`referral-icon is-${key}`} href={shareUrl(bookingLink(key, referralCode), text)} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${label}`} title={`Share on ${label}`}>{icon}</a>
          : <button key={key} type="button" className={`referral-icon is-${key}`} aria-label={`Copy link for ${label}`} title={`Copy link for ${label}`} onClick={() => copyLink(key)}>{icon}</button>
      })}
    </span>
  )
}
