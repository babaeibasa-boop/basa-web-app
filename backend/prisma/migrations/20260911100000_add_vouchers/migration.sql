-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoucherPurchaseStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "voucher_platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "duration" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "encryptedCode" TEXT NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "VoucherPurchaseStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentTrackId" TEXT,
    "paymentToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voucher_platforms_slug_key" ON "voucher_platforms"("slug");

-- CreateIndex
CREATE INDEX "vouchers_platformId_idx" ON "vouchers"("platformId");

-- CreateIndex
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");

-- CreateIndex
CREATE INDEX "vouchers_expiresAt_idx" ON "vouchers"("expiresAt");

-- CreateIndex
CREATE INDEX "vouchers_platformId_amount_duration_status_idx" ON "vouchers"("platformId", "amount", "duration", "status");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_purchases_voucherId_key" ON "voucher_purchases"("voucherId");

-- CreateIndex
CREATE INDEX "voucher_purchases_userId_idx" ON "voucher_purchases"("userId");

-- CreateIndex
CREATE INDEX "voucher_purchases_status_idx" ON "voucher_purchases"("status");

-- CreateIndex
CREATE INDEX "voucher_purchases_paymentTrackId_idx" ON "voucher_purchases"("paymentTrackId");

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "voucher_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_purchases" ADD CONSTRAINT "voucher_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_purchases" ADD CONSTRAINT "voucher_purchases_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
