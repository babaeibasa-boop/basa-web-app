import { Prisma, VoucherPurchaseStatus, VoucherStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { logPayment } from "../lib/logger.js";
import { DURATION_MONTHS_PATTERN, formatDurationMonths, parseDurationMonths } from "../lib/digits.js";
import { walletService } from "./wallet.service.js";
import { config } from "../lib/config.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
}

export interface UpdatePlatformInput {
  name?: string;
  slug?: string;
  logoUrl?: string;
  apiKey?: string;
}

export interface CreateVoucherInput {
  platformId: string;
  amount: string;
  duration: string;
  expiresAt: string;
  code: string;
}

function assertSlug(slug: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new AppError("شناسه پلتفرم فقط می‌تواند شامل حروف انگلیسی کوچک، عدد و خط تیره باشد", 400);
  }
}

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

function serializePlatformPublic<T extends { id: string; name: string; slug: string; logoUrl: string }>(
  platform: T,
) {
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    logoUrl: platform.logoUrl,
  };
}

function serializeAdminPlatform<
  T extends { id: string; name: string; slug: string; logoUrl: string; encryptedApiKey: string; createdAt: Date; updatedAt: Date },
>(platform: T) {
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    logoUrl: platform.logoUrl,
    hasApiKey: platform.encryptedApiKey.length > 0,
    createdAt: platform.createdAt,
    updatedAt: platform.updatedAt,
  };
}

export function groupAvailableOffers(
  vouchers: { amount: bigint; duration: string; expiresAt: Date }[],
) {
  const groups = new Map<
    string,
    { amount: string; duration: string; expiresAt: string; availableCount: number }
  >();

  for (const voucher of vouchers) {
    const duration = canonicalDuration(voucher.duration);
    const existing = groups.get(duration);
    if (existing) {
      existing.availableCount += 1;
      if (voucher.expiresAt.getTime() < Date.parse(existing.expiresAt)) {
        existing.expiresAt = voucher.expiresAt.toISOString();
      }
    } else {
      groups.set(duration, {
        amount: voucher.amount.toString(),
        duration,
        expiresAt: voucher.expiresAt.toISOString(),
        availableCount: 1,
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => durationSortValue(a.duration) - durationSortValue(b.duration) || Number(a.amount) - Number(b.amount),
  );
}

export async function listPlatforms() {
  const platforms = await prisma.voucherPlatform.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });
  return platforms.map(serializePlatformPublic);
}

export async function getPlatformOffers(slug: string) {
  const platform = await prisma.voucherPlatform.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });
  if (!platform) throw new AppError("پلتفرم یافت نشد", 404);

  await releaseStaleReservations(platform.id);

  const vouchers = await prisma.voucher.findMany({
    where: {
      platformId: platform.id,
      status: VoucherStatus.AVAILABLE,
      expiresAt: { gt: new Date() },
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

  return prisma.$transaction(async (tx) => {
    const platform = await tx.voucherPlatform.findUnique({ where: { slug: input.platformSlug } });
    if (!platform) throw new AppError("پلتفرم یافت نشد", 404);

    const available = await tx.voucher.findMany({
      where: {
        platformId: platform.id,
        amount,
        status: VoucherStatus.AVAILABLE,
        expiresAt: { gt: new Date() },
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

    const purchase = await tx.voucherPurchase.create({
      data: {
        userId,
        voucherId: candidate.id,
        amount: candidate.amount,
        status: VoucherPurchaseStatus.PENDING_PAYMENT,
      },
      include: {
        voucher: { include: { platform: true } },
      },
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
  if (purchase.voucher.expiresAt.getTime() <= Date.now()) {
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

export async function getUserPurchases(userId: string) {
  const purchases = await prisma.voucherPurchase.findMany({
    where: { userId },
    include: { voucher: { include: { platform: true } } },
    orderBy: { createdAt: "desc" },
  });
  return purchases.map((purchase) =>
    serializeUserPurchase(purchase, { revealCode: purchase.status === VoucherPurchaseStatus.PAID }),
  );
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
    return { success: true, type: "voucher" as const, purchaseId: purchase.id };
  }

  if (status === "Cancel") {
    logPayment("Voucher payment cancelled by user", { purchaseId: purchase.id });
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
    return { success: false, type: "voucher" as const, purchaseId: purchase.id };
  }

  if (status !== "Done") {
    throw new AppError("وضعیت پرداخت نامعتبر است", 400);
  }

  const pwd = platformPwd(purchase.voucher.platform.encryptedApiKey);
  const settlement = await walletService.settlePayment(paymentTrackId, paymentToken, pwd);

  if (settlement.status !== "OK" || !settlement.data || settlement.data.status !== "Paid") {
    logPayment("Voucher settlement not paid", { purchaseId: purchase.id, status: settlement.status });
    await releasePurchase(purchase.id, purchase.voucherId, purchase.voucher.expiresAt);
    return { success: false, type: "voucher" as const, purchaseId: purchase.id };
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
  return { success: true, type: "voucher" as const, purchaseId: purchase.id };
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

async function releasePurchase(purchaseId: string, voucherId: string, expiresAt: Date) {
  const voucherStatus =
    expiresAt.getTime() > Date.now() ? VoucherStatus.AVAILABLE : VoucherStatus.CANCELLED;

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
      expiresAt: Date;
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
  const platforms = await prisma.voucherPlatform.findMany({ orderBy: { createdAt: "desc" } });
  return platforms.map(serializeAdminPlatform);
}

export async function createPlatform(input: CreatePlatformInput) {
  assertSlug(input.slug);
  try {
    const platform = await prisma.voucherPlatform.create({
      data: {
        name: input.name.trim(),
        slug: input.slug,
        logoUrl: input.logoUrl.trim(),
        encryptedApiKey: encrypt(input.apiKey),
      },
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
  if (input.slug) assertSlug(input.slug);

  try {
    const platform = await prisma.voucherPlatform.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl.trim() } : {}),
        ...(input.apiKey ? { encryptedApiKey: encrypt(input.apiKey) } : {}),
      },
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

export async function createVoucher(input: CreateVoucherInput) {
  const platform = await prisma.voucherPlatform.findUnique({ where: { id: input.platformId } });
  if (!platform) throw new AppError("پلتفرم یافت نشد", 404);

  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AppError("تاریخ انقضا نامعتبر است", 400);
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new AppError("تاریخ انقضا باید در آینده باشد", 400);
  }

  const voucher = await prisma.voucher.create({
    data: {
      platformId: input.platformId,
      amount: BigInt(input.amount),
      duration: normalizeVoucherDuration(input.duration),
      expiresAt,
      encryptedCode: encrypt(input.code.trim()),
      status: VoucherStatus.AVAILABLE,
    },
    include: { platform: true },
  });

  return {
    id: voucher.id,
    amount: voucher.amount.toString(),
    duration: voucher.duration,
    expiresAt: voucher.expiresAt,
    status: voucher.status,
    code: input.code.trim(),
    createdAt: voucher.createdAt,
    platform: serializePlatformPublic(voucher.platform),
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
