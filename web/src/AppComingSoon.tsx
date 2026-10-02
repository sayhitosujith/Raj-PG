import { Smartphone } from 'lucide-react'

// Simplified Android robot and Apple marks drawn inline: lucide no longer ships brand logos.
const AndroidMark = () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 9h10a1 1 0 0 1 1 1v6a2 2 0 0 1-2 2h-1v2.5a1.25 1.25 0 0 1-2.5 0V18h-1v2.5a1.25 1.25 0 0 1-2.5 0V18H8a2 2 0 0 1-2-2v-6a1 1 0 0 1 1-1Zm-3 1.25a1.25 1.25 0 0 1 2.5 0v4.5a1.25 1.25 0 0 1-2.5 0Zm15.5 0a1.25 1.25 0 0 1 2.5 0v4.5a1.25 1.25 0 0 1-2.5 0ZM7.2 8a4.9 4.9 0 0 1 2.3-3.6l-.9-1.5a.4.4 0 0 1 .7-.4l.9 1.5a5.6 5.6 0 0 1 3.6 0l.9-1.5a.4.4 0 0 1 .7.4l-.9 1.5A4.9 4.9 0 0 1 16.8 8Zm2.8-2a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Zm4 0a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Z" /></svg>
const AppleMark = () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.9C6.1 7 4.5 8 3.6 9.6c-1.8 3.2-.5 7.9 1.3 10.5.9 1.3 1.9 2.7 3.2 2.6 1.3 0 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.8-1.1-2.8-4.5ZM14 5.2c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5Z" /></svg>

/**
 * "StayNest app · coming soon" teaser at the foot of the resident's Announcements card: the
 * Android and iOS apps are planned but not released, so the badges are labels, not links.
 */
export function AppComingSoon() {
  return (
    <div className="app-coming-soon">
      <span className="app-coming-soon-icon"><Smartphone size={20} /></span>
      <div className="app-coming-soon-copy"><strong>StayNest mobile app</strong><small>Coming soon to Android and iPhone</small></div>
      <div className="app-coming-soon-badges">
        <span className="store-badge"><AndroidMark /> Android</span>
        <span className="store-badge"><AppleMark /> iOS</span>
        <span className="soon-pill">Coming soon</span>
      </div>
    </div>
  )
}
