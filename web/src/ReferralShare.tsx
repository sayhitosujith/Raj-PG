import type { ReactNode } from 'react'
import { Facebook, Instagram } from 'lucide-react'
import { WhatsAppIcon } from './WhatsAppIcon'
import { bookingLink, bookingSourceLabels } from './booking'
import { FeatureTag, useFeatureBadge } from './FeatureBadges'

// Google's four-colour "G" (lucide ships no brand logos); its colours are fixed, unlike the other icons.
const GoogleMark = () => <svg viewBox="0 0 48 48" width="15" height="15" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
</svg>

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
  const { badge, markSeen } = useFeatureBadge('referral')

  async function copyLink(platform: SharePlatform) {
    const link = bookingLink(platform, referralCode)
    try { await navigator.clipboard.writeText(link); onNotice(`Link copied. Paste it on ${bookingSourceLabels[platform]} to refer a friend.`) } catch { onNotice(link) }
  }

  return (
    <span className="referral-share" onClickCapture={markSeen}>
      Refer a friend{badge && <FeatureTag badge={badge} />}
      {platforms.map(({ key, icon, shareUrl }) => {
        const label = bookingSourceLabels[key]
        return shareUrl
          ? <a key={key} className={`referral-icon is-${key}`} href={shareUrl(bookingLink(key, referralCode), text)} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${label}`} title={`Share on ${label}`}>{icon}</a>
          : <button key={key} type="button" className={`referral-icon is-${key}`} aria-label={`Copy link for ${label}`} title={`Copy link for ${label}`} onClick={() => copyLink(key)}>{icon}</button>
      })}
    </span>
  )
}
