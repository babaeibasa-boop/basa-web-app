-- CreateEnum
CREATE TYPE "CreditFeatureMode" AS ENUM ('API', 'REDIRECT', 'DISABLED');

-- CreateTable
CREATE TABLE "credit_platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "installmentsMode" "CreditFeatureMode" NOT NULL DEFAULT 'DISABLED',
    "installmentsUrl" TEXT,
    "merchantsMode" "CreditFeatureMode" NOT NULL DEFAULT 'DISABLED',
    "merchantsUrl" TEXT,
    "launchUrl" TEXT,
    "instructions" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_platforms_slug_key" ON "credit_platforms"("slug");

-- CreateIndex
CREATE INDEX "credit_platforms_isActive_sortOrder_idx" ON "credit_platforms"("isActive", "sortOrder");
