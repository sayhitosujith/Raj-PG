import { Building2 } from 'lucide-react'
import { logoUrl, useBranding } from './branding'
import { useTransparentLogo } from './transparentLogo'

/**
 * The app's brand: the owner's uploaded logo when there is one, otherwise the raj.pg mark. By default the logo is
 * shown on a transparent background, even when it was uploaded with a plain one (a white tile), so it sits on the
 * sign-in page, the portal and the website alike.
 *
 * `onCard` keeps the logo as uploaded, on a white card instead: on a strongly coloured surface such as the sidebar,
 * a cut-out logo's dark text and fine detail lose almost all contrast against the colour.
 */
export function BrandMark({ onCard = false }: { onCard?: boolean }) {
  const { businessName, logoVersion } = useBranding()
  const source = logoVersion ? logoUrl(logoVersion) : null
  const transparent = useTransparentLogo(onCard ? null : source)
  const logo = onCard ? source : transparent
  if (logo) return <img className={onCard ? 'brand-logo is-on-card' : 'brand-logo'} src={logo} alt={businessName ?? 'Logo'} />
  return <><div className="brand-mark"><Building2 size={19} strokeWidth={2.5} /></div><span>raj<span className="brand-accent">.</span>pg</span></>
}
