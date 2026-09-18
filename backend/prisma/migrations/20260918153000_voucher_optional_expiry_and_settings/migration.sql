-- AlterTable
ALTER TABLE "vouchers" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- Seed default: hide vouchers expiring within two days
INSERT INTO "app_settings" ("key", "value", "createdAt", "updatedAt")
VALUES ('hideVouchersExpiringSoon', 'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
