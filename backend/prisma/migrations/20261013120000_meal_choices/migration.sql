-- Meal skips become meal choices: residents now answer eat or skip for each meal the day before.
-- Existing rows are skips, so they keep eating = false.
ALTER TABLE "MealSkip" RENAME TO "MealChoice";
ALTER TABLE "MealChoice" RENAME CONSTRAINT "MealSkip_pkey" TO "MealChoice_pkey";
ALTER TABLE "MealChoice" RENAME CONSTRAINT "MealSkip_residentId_fkey" TO "MealChoice_residentId_fkey";
ALTER INDEX "MealSkip_residentId_date_meal_key" RENAME TO "MealChoice_residentId_date_meal_key";

ALTER TABLE "MealChoice" ADD COLUMN "eating" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MealChoice" ALTER COLUMN "eating" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
