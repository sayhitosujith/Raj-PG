import { Building2 } from 'lucide-react'
import { logoUrl, useBranding } from './branding'
import { useTransparentLogo } from './transparentLogo'

/**
 * The app's brand: the owner's uploaded logo when there is one, otherwise the raj.pg mark. The logo is always shown
 * on a transparent background, even when it was uploaded with a plain one (a white tile), so it sits on the sidebar's
 * colour, the sign-in page and the portal alike.
 */
export function BrandMark() {
  const { businessName, logoVersion } = useBranding()
  const logo = useTransparentLogo(logoVersion ? logoUrl(logoVersion) : null)
  if (logo) return <img className="brand-logo" src={logo} alt={businessName ?? 'Logo'} />
  return <><div className="brand-mark"><Building2 size={19} strokeWidth={2.5} /></div><span>raj<span className="brand-accent">.</span>pg</span></>
}
