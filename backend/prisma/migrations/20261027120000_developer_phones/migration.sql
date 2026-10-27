-- CreateTable
CREATE TABLE "developer_phones" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "developer_phones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "developer_phones_phone_key" ON "developer_phones"("phone");

-- Keep the phones that were previously hardcoded as developer access.
INSERT INTO "developer_phones" ("id", "phone", "createdAt")
VALUES
    ('seed_dev_phone_1', '989381333551', CURRENT_TIMESTAMP),
    ('seed_dev_phone_2', '989131864939', CURRENT_TIMESTAMP),
    ('seed_dev_phone_3', '989134435372', CURRENT_TIMESTAMP);
