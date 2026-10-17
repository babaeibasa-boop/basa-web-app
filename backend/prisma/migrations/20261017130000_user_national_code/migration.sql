-- AlterTable
ALTER TABLE "users" ADD COLUMN "nationalCode" TEXT;

-- CreateIndex
CREATE INDEX "users_nationalCode_idx" ON "users"("nationalCode");
