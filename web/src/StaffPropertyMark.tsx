import { BrandMark } from './BrandMark'
import { useTransparentLogo } from './transparentLogo'

/**
 * The sidebar's brand for a receptionist: the property they work at (its image and name) rather than the workspace
 * logo. A receptionist has one property (one receptionist per PG; superAdmins.ts); someone set up with several before
 * that rule sees the first until a super admin re-saves them. Falls back to the workspace logo while their property
 * loads or when none is assigned.
 */
export function StaffPropertyMark({ property }: { property: { name: string; image?: string | null } | undefined }) {
  // Many properties use their logo as the image; its plain background is cleared like the workspace logo's.
  const image = useTransparentLogo(property?.image ?? null)
  if (!property) return <BrandMark />
  return (
    <div className="staff-property-mark">
      {image ? <img src={image} alt="" /> : <span className="staff-property-initial" aria-hidden="true">{property.name.charAt(0)}</span>}
      <strong>{property.name}</strong>
    </div>
  )
}
