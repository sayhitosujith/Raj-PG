-- Fills in who approved or rejected IDs decided before aadharReviewedByName was kept, from the staff
-- activity log ("Verified <name>'s ID document"). Only an entry within 5 minutes of the recorded decision
-- counts, so a resident renamed since, or one with no logged decision, is left without a name.
UPDATE "Resident" AS r
SET "aadharReviewedByName" = (
  SELECT sa."staffName"
  FROM "StaffActivity" AS sa
  WHERE sa."action" = (CASE WHEN r."aadharStatus" = 'VERIFIED' THEN 'Verified ' ELSE 'Rejected ' END) || r."name" || '''s ID document'
    AND sa."createdAt" BETWEEN r."aadharReviewedAt" - INTERVAL '5 minutes' AND r."aadharReviewedAt" + INTERVAL '5 minutes'
  ORDER BY ABS(EXTRACT(EPOCH FROM (sa."createdAt" - r."aadharReviewedAt")))
  LIMIT 1
)
WHERE r."aadharReviewedByName" IS NULL
  AND r."aadharReviewedAt" IS NOT NULL
  AND r."aadharStatus" IN ('VERIFIED', 'REJECTED');
