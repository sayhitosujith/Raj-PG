-- Veg / non-veg per resident, for the kitchen's headcount split. Nullable: existing residents and
-- anyone not yet asked are "Not set", never silently counted as one or the other.
CREATE TYPE "Diet" AS ENUM ('VEG', 'NON_VEG');

ALTER TABLE "Resident" ADD COLUMN "diet" "Diet";
