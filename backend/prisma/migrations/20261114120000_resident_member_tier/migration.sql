-- Membership tier per resident, set by staff and shown under their name in the portal. Existing
-- residents get the default, Silver.
CREATE TYPE "MemberTier" AS ENUM ('SILVER', 'GOLD', 'PEARL');

ALTER TABLE "Resident" ADD COLUMN "memberTier" "MemberTier" NOT NULL DEFAULT 'SILVER';
