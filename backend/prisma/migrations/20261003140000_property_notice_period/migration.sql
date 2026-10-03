-- A property's own move-out notice period in days; null uses the notice period from Settings.
ALTER TABLE "Property" ADD COLUMN "noticePeriodDays" INTEGER;
