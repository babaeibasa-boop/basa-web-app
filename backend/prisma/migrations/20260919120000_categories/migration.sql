-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_sortOrder_idx" ON "categories"("sortOrder");

-- Seed existing RefTek categories plus a backfill bucket
INSERT INTO "categories" ("id", "name", "slug", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('cat-ai', 'هوش مصنوعی', 'ai', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-mobile-apps-games', 'اپلیکیشن، گیم و خدمات موبایل', 'mobile-apps-games', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-health-sports', 'ورزش، سلامت جسم و ذهن', 'health-sports', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-education', 'آموزش و مهارت آموزی', 'education', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-home-services', 'خدمات خانه', 'home-services', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-entertainment', 'سرگرمی، فیلم و سریال', 'entertainment', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-books', 'کتاب و مطالعه', 'books', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-other', 'سایر', 'other', 99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "voucher_platforms" ADD COLUMN "categoryId" TEXT;

UPDATE "voucher_platforms" SET "categoryId" = 'cat-other' WHERE "categoryId" IS NULL;

ALTER TABLE "voucher_platforms" ALTER COLUMN "categoryId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "voucher_platforms_categoryId_idx" ON "voucher_platforms"("categoryId");

-- AddForeignKey
ALTER TABLE "voucher_platforms" ADD CONSTRAINT "voucher_platforms_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
