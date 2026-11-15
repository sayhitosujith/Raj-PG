import { Building2 } from 'lucide-react'
import { logoUrl, useBranding } from './branding'
import { useTransparentLogo } from './transparentLogo'

/**
 * The app's brand: the owner's uploaded logo when there is one, otherwise the StayPilot mark. The logo is always
 * shown on a transparent background, even when it was uploaded with a plain one (a white tile), so it sits on the
 * sidebar, the sign-in page, the portal and the website alike; App.css outlines it where the background is coloured.
 */
export function BrandMark() {
  const { businessName, logoVersion } = useBranding()
  const logo = useTransparentLogo(logoVersion ? logoUrl(logoVersion) : null)
  if (logo) return <img className="brand-logo" src={logo} alt={businessName ?? 'Logo'} />
  return <><div className="brand-mark"><Building2 size={19} strokeWidth={2.5} /></div><span>Stay<span className="brand-accent">Pilot</span></span></>
}
