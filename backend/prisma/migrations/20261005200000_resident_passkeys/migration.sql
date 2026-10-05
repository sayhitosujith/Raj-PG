-- Passkeys residents save on their phone to sign in with Face ID, Touch ID or a fingerprint.
CREATE TABLE "ResidentPasskey" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ResidentPasskey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResidentPasskey_credentialId_key" ON "ResidentPasskey"("credentialId");

CREATE INDEX "ResidentPasskey_residentId_idx" ON "ResidentPasskey"("residentId");

ALTER TABLE "ResidentPasskey" ADD CONSTRAINT "ResidentPasskey_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
