import { useEffect, useState } from 'react'
import { Download, Globe, PlusSquare, Share, Sparkles, Star, UtensilsCrossed, WalletCards, Wrench, X } from 'lucide-react'
import { isAppleMobile, isInstalledApp, promptInstall, useCanInstall } from './installPrompt'

const dismissedKey = 'staynest-app-sheet-dismissed'
const phoneQuery = '(max-width: 719px)'
const showAfterMs = 1500

const features = [
  { icon: WalletCards, label: 'Rent & receipts' },
  { icon: UtensilsCrossed, label: 'Menu & meal skips' },
  { icon: Sparkles, label: 'Housekeeping' },
  { icon: Wrench, label: 'Repair requests' },
]

// Per-phone memory in localStorage; when storage is unavailable the sheet may show again next visit.
const wasDismissed = () => { try { return window.localStorage.getItem(dismissedKey) === '1' } catch { return false } }
const rememberDismissed = () => { try { window.localStorage.setItem(dismissedKey, '1') } catch { /* shows again next visit */ } }

/**
 * The website's "get the app" sheet for phones: it slides up a moment after the first visit and offers
 * to install the web app on the home screen (no app store). Android browsers show their own install
 * dialog; iPhones get the two Safari steps; other browsers are pointed at their menu. "Continue with
 * browser" (or ×) hides it for good on that phone. Never shown inside the installed app or on bigger screens.
 */
export function SiteAppSheet({ businessName }: { businessName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [help, setHelp] = useState<'apple' | 'menu' | null>(null)
  const canInstall = useCanInstall()

  useEffect(() => {
    if (wasDismissed() || isInstalledApp() || !window.matchMedia(phoneQuery).matches) return
    const timer = window.setTimeout(() => setIsOpen(true), showAfterMs)
    return () => window.clearTimeout(timer)
  }, [])

  function close() {
    rememberDismissed()
    setIsOpen(false)
  }

  async function install() {
    if (canInstall) { if (await promptInstall()) close(); return }
    setHelp(isAppleMobile() ? 'apple' : 'menu')
  }

  if (!isOpen) return null
  return (
    <div className="site-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="site-sheet" role="dialog" aria-modal="true" aria-labelledby="site-sheet-title">
        <div className="site-sheet-app">
          <img src="/icon-192.png" alt="" width={48} height={48} />
          <div><strong>{businessName}</strong><small>Mobile app</small></div>
          <button type="button" className="site-sheet-close" aria-label="Close" onClick={close}><X size={18} /></button>
        </div>
        <h2 id="site-sheet-title"><span className="site-sheet-star"><Star size={14} aria-hidden="true" /></span> Get the best experience!</h2>
        <p>Add the app to your home screen: it opens full screen like any app and keeps rent, meals and requests one tap away.</p>
        <ul className="site-sheet-features">{features.map(({ icon: Icon, label }) => <li key={label}><Icon size={14} aria-hidden="true" /> {label}</li>)}</ul>
        {help === 'apple' && <ol className="site-sheet-help"><li>Tap <Share size={14} aria-label="Share" /> Share at the bottom of Safari</li><li>Choose <PlusSquare size={14} aria-hidden="true" /> <b>Add to Home Screen</b>, then <b>Add</b></li></ol>}
        {help === 'menu' && <p className="site-sheet-help">Open your browser's menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>}
        <button type="button" className="primary-button site-sheet-install" onClick={() => void install()}><Download size={17} aria-hidden="true" /> Install app</button>
        <button type="button" className="secondary-button site-sheet-browser" onClick={close}><Globe size={16} aria-hidden="true" /> Continue with browser</button>
      </section>
    </div>
  )
}
