-- Owner's override for the overdue-rent lockout: the resident may use the app up to and including
-- this date (IST) even with rent overdue. Null means no override.
ALTER TABLE "Resident" ADD COLUMN "rentAccessUntil" DATE;
