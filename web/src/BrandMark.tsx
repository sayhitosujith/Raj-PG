import { Building2 } from 'lucide-react'
import { logoUrl, useBranding } from './branding'

/** The app's brand: the owner's uploaded logo when there is one, otherwise the raj.pg mark. */
export function BrandMark() {
  const { businessName, logoVersion } = useBranding()
  if (logoVersion) return <img className="brand-logo" src={logoUrl(logoVersion)} alt={businessName ?? 'Logo'} />
  return <><div className="brand-mark"><Building2 size={19} strokeWidth={2.5} /></div><span>raj<span className="brand-accent">.</span>pg</span></>
}
