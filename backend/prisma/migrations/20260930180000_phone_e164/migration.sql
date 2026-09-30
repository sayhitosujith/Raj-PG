-- Phone numbers are now stored in E.164 form (+<country code><number>) so non-Indian numbers can be
-- kept. Every number stored so far is Indian, so each accepted Indian spelling (10 digits, or with
-- "0", "91" or "+91" in front) becomes "+91" and its 10 digits. Anything else is left as it is.
-- Safe to re-run: an already converted "+91…" value maps to itself.
UPDATE "Resident" SET "phone" = '+91' || right(regexp_replace("phone", '\D', '', 'g'), 10)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^(0|91)?[0-9]{10}$';

UPDATE "Booking" SET "phone" = '+91' || right(regexp_replace("phone", '\D', '', 'g'), 10)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^(0|91)?[0-9]{10}$';

UPDATE "Payment" SET "phone" = '+91' || right(regexp_replace("phone", '\D', '', 'g'), 10)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^(0|91)?[0-9]{10}$';

UPDATE "SuperAdmin" SET "phone" = '+91' || right(regexp_replace("phone", '\D', '', 'g'), 10)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^(0|91)?[0-9]{10}$';
