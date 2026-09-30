-- Super admins now record identity details. Nullable so existing admins stay valid; the API
-- requires them for admins added from the dashboard.
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

ALTER TABLE "SuperAdmin" ADD COLUMN "phone" TEXT,
ADD COLUMN "aadharNumber" TEXT,
ADD COLUMN "sex" "Sex",
ADD COLUMN "nationality" TEXT,
ADD COLUMN "permanentAddress" TEXT;
