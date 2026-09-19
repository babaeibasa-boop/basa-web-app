import { Prisma, VoucherPurchaseStatus, VoucherStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { logPayment } from "../lib/logger.js";
import { DURATION_MONTHS_PATTERN, formatDurationMonths, parseDigitString, parseDurationMonths } from "../lib/digits.js";
import {
  assertExpiryInFuture,
  availableVoucherExpiryWhere,
  isVoucherExpired,
  parseVoucherExpiresAt,
} from "../lib/voucher-expiry.js";
import { assertSlug } from "../lib/slug.js";
import { walletService } from "./wallet.service.js";
import { isHideVouchersExpiringSoonEnabled } from "./settings.service.js";
import { config } from "../lib/config.js";

const MAX_VOUCHER_IMPORT_ROWS = 500;

const STALE_UNPAID_MS = 2 * 60 * 1000;
const STALE_CHECKOUT_MS = 15 * 60 * 1000;

export interface CreatePurchaseInput {
  platformSlug: string;
  amount: string;
  duration: string;
}

export interface CreatePlatformInput {
  name: string;
  slug: string;
  logoUrl: string;
  apiKey: string;
  categoryId: string;
}

export interface UpdatePlatformInput {
  name?: string;
  slug?: string;
  logoUrl?: string;
  apiKey?: string;
  categoryId?: string;
}

export interface CreateVoucherInput {
  platformId: string;
  amount: string;
  duration: string;
  expiresAt?: unknown;
  code: string;
}

export interface ImportVoucherRow {
  platform?: unknown;
  amount?: unknown;
  duration?: unknown;
  expiresAt?: unknown;
  code?: unknown;
}

type CategorySummary = { id: string; name: string; slug: string; sortOrder?: number };

function platformPwd(encryptedApiKey: string) {
  try {
    return decrypt(encryptedApiKey);
  } catch {
    throw new AppError("کلید درگاه پلتفرم نامعتبر است", 500);
  }
}

export function walletCallbackUrlForPlatform(baseUrl: string, platformSlug: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("platform", platformSlug);
  return url.toString();
}

function normalizeVoucherDuration(value: string) {
  const duration = parseDurationMonths(value);
  if (!DURATION_MONTHS_PATTERN.test(duration)) {
    throw new AppError("مدت واچر باید تعداد ماه و فقط عدد باشد", 400);
  }
  return duration;
}

function canonicalDuration(value: string) {
  const months = parseDurationMonths(value);
  return DURATION_MONTHS_PATTERN.test(months) ? months : value.trim();
}

function durationSortValue(duration: string) {
  const months = parseDurationMonths(duration);
  return DURATION_MONTHS_PATTERN.test(months) ? Number(months) : Number.POSITIVE_INFINITY;
}

function serializeCategory(category: CategorySummary) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    ...(category.sortOrder !== undefined ? { sortOrder: category.sortOrder } : {}),
  };
}

function serializePlatformPublic<
  T extends { id: string; name: string; slug: string; logoUrl: string; category?: CategorySummary | null },
>(platform: T) {
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    logoUrl: platform.logoUrl,
    ...(platform.category ? { category: serializeCategory(platform.category) } : {}),
  };
}

function serializeAdminPlatform<
  T extends {
    id: string;
    name: string;
    slug: string;
    logoUrl: string;
    encryptedApiKey: string;
    createdAt: Date;
    updatedAt: Date;
    category?: CategorySummary | null;
  },
>(platform: T) {
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    logoUrl: platform.logoUrl,
    hasApiKey: platform.encryptedApiKey.length > 0,
    createdAt: platform.createdAt,
    updatedAt: platform.updatedAt,
    ...(platform.category ? { category: serializeCategory(platform.category) } : {}),
  };
}

async function assertCategoryExists(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new AppError("دسته‌بندی یافت نشد", 404);
  return category;
}

function earlierOfferExpiry(existing: string | null, next: Date | null) {
  if (!next) return existing;
  const nextIso = next.toISOString();
  if (!existing) return nextIso;
  return Date.parse(nextIso) < Date.parse(existing) ? nextIso : existing;
}

export function groupAvailableOffers(
  vouchers: { amount: bigint; duration: string; expiresAt: Date | null }[],
) {
  const groups = new Map<
    string,
    { amount: string; duration: string; expiresAt: string | null; availableCount: number }
  >();

  for (const voucher of vouchers) {
    const duration = canonicalDuration(voucher.duration);
    const existing = groups.get(duration);
    if (existing) {
      existing.availableCount += 1;
      existing.expiresAt = earlierOfferExpiry(existing.expiresAt, voucher.expiresAt);
    } else {
      groups.set(duration, {
        amount: voucher.amount.toString(),
        duration,
        expiresAt: voucher.expiresAt ? voucher.expiresAt.toISOString() : null,
        availableCount: 1,
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => durationSortValue(a.duration) - durationSortValue(b.duration) || Number(a.amount) - Number(b.amount),
  );
}

export async function getPlatformOffers(slug: string) {
  const platform = await prisma.voucherPlatform.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!platform) throw new AppError("پلتفرم یافت نشد", 404);

  await releaseStaleReservations(platform.id);

  const hideExpiringSoon = await isHideVouchersExpiringSoonEnabled();
  const vouchers = await prisma.voucher.findMany({
    where: {
      platformId: platform.id,
      status: VoucherStatus.AVAILABLE,
      ...availableVoucherExpiryWhere(hideExpiringSoon),
    },
    select: { amount: true, duration: true, expiresAt: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    platform: serializePlatformPublic(platform),
    offers: groupAvailableOffers(vouchers),
  };
}

export async function createPurchase(userId: string, input: CreatePurchaseInput) {
  const amount = BigInt(input.amount);
  const duration = normalizeVoucherDuration(input.duration);
  const hideExpiringSoon = await isHideVouchersExpiringSoonEnabled();

  return prisma.$transaction(async (tx) => {
    const platform = await tx.voucherPlatform.findUnique({ where: { slug: input.platformSlug } });
    if (!platform) throw new AppError("پلتفرم یافت نشد", 404);

    const available = await tx.voucher.findMany({
      where: {
        platformId: platform.id,
        amount,
        status: VoucherStatus.AVAILABLE,
        ...availableVoucherExpiryWhere(hideExpiringSoon),
      },
      orderBy: { createdAt: "asc" },
    });
    const candidate = available.find((voucher) => canonicalDuration(voucher.duration) === duration);
    if (!candidate) {
      throw new AppError("موجودی تمام شد", 409);
    }

    const reserved = await tx.voucher.updateMany({
      where: { id: candidate.id, status: VoucherStatus.AVAILABLE },
      data: { status: VoucherStatus.RESERVED },
    });
    if (reserved.count === 0) {
      throw new AppError("موجودی تمام شد", 409);
    }

    const purchaseInclude = { voucher: { include: { platform: true } } } as const;
    const existingPurchase = await tx.voucherPurchase.findUnique({
      where: { voucherId: candidate.id },
    });
    // Cancelled rows keep the unique voucherId, so a later reserve must reuse them.
    if (existingPurchase && existingPurchase.status !== VoucherPurchaseStatus.CANCELLED) {
      throw new AppError("موجودی تمام شد", 409);
    }

    const purchase = existingPurchase
      ? await tx.voucherPurchase.update({
          where: { id: existingPurchase.id },
          data: {
            userId,
            amount: candidate.amount,
            status: VoucherPurchaseStatus.PENDING_PAYMENT,
            paymentTrackId: null,
            paymentToken: null,
          },
          include: purchaseInclude,
        })
      : await tx.voucherPurchase.create({
          data: {
            userId,
            voucherId: candidate.id,
            amount: candidate.amount,
            status: VoucherPurchaseStatus.PENDING_PAYMENT,
          },
          include: purchaseInclude,
        });

    return serializeUserPurchase(purchase, { revealCode: false });
  });
}

export async function initiateVoucherPayment(purchaseId: string, userId: string) {
  const purchase = await prisma.voucherPurchase.findFirst({
    where: { id: purchaseId, userId },
    include: {
      user: true,
      voucher: { include: { platform: true } },
    },
  });

  if (!purchase) throw new AppError("خرید واچر یافت نشد", 404);
  if (purchase.status !== VoucherPurchaseStatus.PENDING_PAYMENT) {
    throw new AppError("این خرید قابل پرداخت نیست", 400);
  }
  if (purchase.voucher.status !== VoucherStatus.RESERVED) {
    throw new AppError("این واچر قابل پرداخت نیست", 400);
  }
  if (isVoucherExpired(purchase.voucher.expiresAt)) {
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
    throw new AppError("این واچر منقضی شده است", 400);
  }

  const pwd = platformPwd(purchase.voucher.platform.encryptedApiKey);
  let payment;
  try {
    payment = await walletService.requestPayment(
      {
        user_token: purchase.user.walletToken,
        amount: Number(purchase.amount),
        currency: "IRR",
        description: `پرداخت واچر ${purchase.voucher.platform.name}`,
        invoice: {
          items: [
            {
              item_code: purchase.id,
              item_title: `${purchase.voucher.platform.name} - ${formatDurationMonths(purchase.voucher.duration)}`,
              item_count: "1",
              unit_title: "عدد",
              item_total_amount: Number(purchase.amount),
            },
          ],
        },
        callback_url: walletCallbackUrlForPlatform(
          config.walletCallbackUrl,
          purchase.voucher.platform.slug,
        ),
      },
      pwd,
    );
  } catch (error) {
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
    throw error;
  }

  if (!payment?.pay_url) {
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
    throw new AppError("خطا در ایجاد درخواست پرداخت", 502);
  }

  await prisma.voucherPurchase.update({
    where: { id: purchase.id },
    data: { paymentTrackId: payment.payment_track_id },
  });

  logPayment("Voucher payment initiated", {
    purchaseId: purchase.id,
    trackId: payment.payment_track_id,
  });
  return { payUrl: payment.pay_url };
}

export async function getUserPurchases(userId: string, platformSlug?: string) {
  const purchases = await prisma.voucherPurchase.findMany({
    where: {
      userId,
      ...(platformSlug ? { voucher: { platform: { slug: platformSlug } } } : {}),
    },
    include: { voucher: { include: { platform: true } } },
    orderBy: { createdAt: "desc" },
  });
  return purchases.map((purchase) =>
    serializeUserPurchase(purchase, { revealCode: purchase.status === VoucherPurchaseStatus.PAID }),
  );
}

function voucherPaymentResult(
  success: boolean,
  purchase: { id: string; voucher: { platform: { slug: string } } },
) {
  return {
    success,
    type: "voucher" as const,
    purchaseId: purchase.id,
    platformSlug: purchase.voucher.platform.slug,
  };
}

export async function verifyVoucherPayment(
  paymentTrackId: string,
  paymentToken: string,
  status: string,
) {
  const purchase = await prisma.voucherPurchase.findFirst({
    where: { paymentTrackId },
    include: { voucher: { include: { platform: true } } },
  });
  if (!purchase) return null;

  if (purchase.status === VoucherPurchaseStatus.PAID) {
    return voucherPaymentResult(true, purchase);
  }

  if (status === "Cancel") {
    logPayment("Voucher payment cancelled by user", { purchaseId: purchase.id });
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
    return voucherPaymentResult(false, purchase);
  }

  if (status !== "Done") {
    throw new AppError("وضعیت پرداخت نامعتبر است", 400);
  }

  const pwd = platformPwd(purchase.voucher.platform.encryptedApiKey);
  const settlement = await walletService.settlePayment(paymentTrackId, paymentToken, pwd);

  if (settlement.status !== "OK" || !settlement.data || settlement.data.status !== "Paid") {
    logPayment("Voucher settlement not paid", { purchaseId: purchase.id, status: settlement.status });
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
    return voucherPaymentResult(false, purchase);
  }

  await prisma.$transaction([
    prisma.voucherPurchase.update({
      where: { id: purchase.id },
      data: { status: VoucherPurchaseStatus.PAID, paymentToken },
    }),
    prisma.voucher.update({
      where: { id: purchase.voucherId },
      data: { status: VoucherStatus.SOLD },
    }),
  ]);

  logPayment("Voucher invoice paid", { purchaseId: purchase.id });
  return voucherPaymentResult(true, purchase);
}

async function releaseStaleReservations(platformId: string) {
  const unpaidCutoff = new Date(Date.now() - STALE_UNPAID_MS);
  const checkoutCutoff = new Date(Date.now() - STALE_CHECKOUT_MS);

  const stale = await prisma.voucherPurchase.findMany({
    where: {
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      voucher: { status: VoucherStatus.RESERVED, platformId },
      OR: [
        { paymentTrackId: null, createdAt: { lt: unpaidCutoff } },
        { paymentTrackId: { not: null }, createdAt: { lt: checkoutCutoff } },
      ],
    },
    select: { id: true, voucherId: true, voucher: { select: { expiresAt: true } } },
  });

  for (const purchase of stale) {
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
  }
}

async function releasePurchase(purchaseId: string, voucherId: string, expiresAt: Date | null) {
  const voucherStatus = isVoucherExpired(expiresAt) ? VoucherStatus.CANCELLED : VoucherStatus.AVAILABLE;

  await prisma.$transaction([
    prisma.voucherPurchase.updateMany({
      where: { id: purchaseId, status: VoucherPurchaseStatus.PENDING_PAYMENT },
      data: { status: VoucherPurchaseStatus.CANCELLED },
    }),
    prisma.voucher.updateMany({
      where: { id: voucherId, status: VoucherStatus.RESERVED },
      data: { status: voucherStatus },
    }),
  ]);
}

function serializeUserPurchase(
  purchase: {
    id: string;
    amount: bigint;
    status: VoucherPurchaseStatus;
    createdAt: Date;
    updatedAt: Date;
    voucher: {
      id: string;
      duration: string;
      expiresAt: Date | null;
      status: VoucherStatus;
      encryptedCode: string;
      platform: { id: string; name: string; slug: string; logoUrl: string };
    };
  },
  options: { revealCode: boolean },
) {
  return {
    id: purchase.id,
    amount: purchase.amount.toString(),
    status: purchase.status,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
    voucher: {
      id: purchase.voucher.id,
      duration: purchase.voucher.duration,
      expiresAt: purchase.voucher.expiresAt,
      status: purchase.voucher.status,
      platform: serializePlatformPublic(purchase.voucher.platform),
      code: options.revealCode ? decrypt(purchase.voucher.encryptedCode) : null,
    },
  };
}

export async function listAdminPlatforms() {
  const platforms = await prisma.voucherPlatform.findMany({
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
  return platforms.map(serializeAdminPlatform);
}

export async function createPlatform(input: CreatePlatformInput) {
  assertSlug(input.slug, "شناسه پلتفرم");
  await assertCategoryExists(input.categoryId);
  try {
    const platform = await prisma.voucherPlatform.create({
      data: {
        name: input.name.trim(),
        slug: input.slug,
        logoUrl: input.logoUrl.trim(),
        encryptedApiKey: encrypt(input.apiKey),
        categoryId: input.categoryId,
      },
      include: { category: true },
    });
    return serializeAdminPlatform(platform);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("این شناسه پلتفرم قبلاً ثبت شده است", 409);
    }
    throw error;
  }
}

export async function updatePlatform(id: string, input: UpdatePlatformInput) {
  const existing = await prisma.voucherPlatform.findUnique({ where: { id } });
  if (!existing) throw new AppError("پلتفرم یافت نشد", 404);
  if (input.slug) assertSlug(input.slug, "شناسه پلتفرم");
  if (input.categoryId) await assertCategoryExists(input.categoryId);

  try {
    const platform = await prisma.voucherPlatform.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl.trim() } : {}),
        ...(input.apiKey ? { encryptedApiKey: encrypt(input.apiKey) } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      },
      include: { category: true },
    });
    return serializeAdminPlatform(platform);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("این شناسه پلتفرم قبلاً ثبت شده است", 409);
    }
    throw error;
  }
}

export async function deletePlatform(id: string) {
  const existing = await prisma.voucherPlatform.findUnique({ where: { id } });
  if (!existing) throw new AppError("پلتفرم یافت نشد", 404);

  const purchaseCount = await prisma.voucherPurchase.count({
    where: { voucher: { platformId: id } },
  });
  if (purchaseCount > 0) {
    throw new AppError("پلتفرم دارای خرید است و قابل حذف نیست", 400);
  }

  await prisma.voucher.deleteMany({ where: { platformId: id } });
  await prisma.voucherPlatform.delete({ where: { id } });
}

export async function listAdminVouchers(params: {
  status?: VoucherStatus;
  platformId?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const skip = (params.page - 1) * params.limit;
  const where: Prisma.VoucherWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.platformId ? { platformId: params.platformId } : {}),
    ...(params.search
      ? {
          OR: [
            { duration: { contains: params.search, mode: "insensitive" } },
            { platform: { name: { contains: params.search, mode: "insensitive" } } },
            { platform: { slug: { contains: params.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [vouchers, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      include: { platform: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: params.limit,
    }),
    prisma.voucher.count({ where }),
  ]);

  return {
    vouchers: vouchers.map((voucher) => ({
      id: voucher.id,
      amount: voucher.amount.toString(),
      duration: voucher.duration,
      expiresAt: voucher.expiresAt,
      status: voucher.status,
      code: decrypt(voucher.encryptedCode),
      createdAt: voucher.createdAt,
      platform: serializePlatformPublic(voucher.platform),
    })),
    total,
    page: params.page,
    limit: params.limit,
  };
}

function serializeAdminVoucher<
  T extends {
    id: string;
    amount: bigint;
    duration: string;
    expiresAt: Date | null;
    status: VoucherStatus;
    createdAt: Date;
    platform: { id: string; name: string; slug: string; logoUrl: string };
  },
>(voucher: T, code: string) {
  return {
    id: voucher.id,
    amount: voucher.amount.toString(),
    duration: voucher.duration,
    expiresAt: voucher.expiresAt,
    status: voucher.status,
    code,
    createdAt: voucher.createdAt,
    platform: serializePlatformPublic(voucher.platform),
  };
}

export async function createVoucher(input: CreateVoucherInput) {
  const platform = await prisma.voucherPlatform.findUnique({ where: { id: input.platformId } });
  if (!platform) throw new AppError("پلتفرم یافت نشد", 404);

  const expiresAt = parseVoucherExpiresAt(input.expiresAt);
  assertExpiryInFuture(expiresAt);
  const code = input.code.trim();
  if (!code) throw new AppError("کد واچر الزامی است", 400);

  const voucher = await prisma.voucher.create({
    data: {
      platformId: input.platformId,
      amount: BigInt(input.amount),
      duration: normalizeVoucherDuration(input.duration),
      expiresAt,
      encryptedCode: encrypt(code),
      status: VoucherStatus.AVAILABLE,
    },
    include: { platform: true },
  });

  return serializeAdminVoucher(voucher, code);
}

function rowValue(row: ImportVoucherRow, keys: string[]) {
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] != null && String(record[key]).trim() !== "") return record[key];
  }
  return undefined;
}

async function resolveImportPlatform(
  value: unknown,
  platforms: { id: string; name: string; slug: string }[],
) {
  const key = String(value ?? "").trim();
  if (!key) throw new AppError("پلتفرم الزامی است", 400);
  const normalized = key.toLowerCase();
  const platform =
    platforms.find((item) => item.slug.toLowerCase() === normalized) ??
    platforms.find((item) => item.name.toLowerCase() === normalized);
  if (!platform) throw new AppError("پلتفرم یافت نشد", 404);
  return platform;
}

export async function importVouchers(rows: ImportVoucherRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError("فایل اکسل خالی است", 400);
  }
  if (rows.length > MAX_VOUCHER_IMPORT_ROWS) {
    throw new AppError(`حداکثر ${MAX_VOUCHER_IMPORT_ROWS} ردیف در هر ورود مجاز است`, 400);
  }

  const platforms = await prisma.voucherPlatform.findMany({
    select: { id: true, name: true, slug: true },
  });

  const created: Awaited<ReturnType<typeof createVoucher>>[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const row = rows[index] ?? {};
    try {
      const platform = await resolveImportPlatform(rowValue(row, ["platform", "پلتفرم", "slug", "platformSlug"]), platforms);
      const amount = parseDigitString(String(rowValue(row, ["amount", "مبلغ"]) ?? ""));
      if (!/^\d+$/.test(amount)) throw new AppError("مبلغ باید عدد باشد", 400);
      const duration = parseDurationMonths(String(rowValue(row, ["duration", "مدت"]) ?? ""));
      const code = String(rowValue(row, ["code", "کد"]) ?? "").trim();
      const voucher = await createVoucher({
        platformId: platform.id,
        amount,
        duration,
        expiresAt: rowValue(row, ["expiresAt", "تاریخ انقضا", "expiry", "expiration"]),
        code,
      });
      created.push(voucher);
    } catch (error) {
      const message = error instanceof AppError ? error.message : "خطا در ورود این ردیف";
      errors.push({ row: rowNumber, message });
    }
  }

  return {
    created: created.length,
    failed: errors.length,
    errors,
  };
}

export async function listVoucherSales(params: { search?: string; page: number; limit: number }) {
  const skip = (params.page - 1) * params.limit;
  const where: Prisma.VoucherPurchaseWhereInput = {
    status: VoucherPurchaseStatus.PAID,
    ...(params.search
      ? {
          OR: [
            { user: { name: { contains: params.search, mode: "insensitive" } } },
            { user: { family: { contains: params.search, mode: "insensitive" } } },
            { user: { phone: { contains: params.search, mode: "insensitive" } } },
            { voucher: { platform: { name: { contains: params.search, mode: "insensitive" } } } },
            { voucher: { duration: { contains: params.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [purchases, total] = await Promise.all([
    prisma.voucherPurchase.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, family: true, phone: true } },
        voucher: { include: { platform: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: params.limit,
    }),
    prisma.voucherPurchase.count({ where }),
  ]);

  return {
    sales: purchases.map((purchase) => ({
      id: purchase.id,
      amount: purchase.amount.toString(),
      status: purchase.status,
      createdAt: purchase.createdAt,
      user: purchase.user,
      voucher: {
        id: purchase.voucher.id,
        duration: purchase.voucher.duration,
        expiresAt: purchase.voucher.expiresAt,
        code: decrypt(purchase.voucher.encryptedCode),
        platform: serializePlatformPublic(purchase.voucher.platform),
      },
    })),
    total,
    page: params.page,
    limit: params.limit,
  };
}
