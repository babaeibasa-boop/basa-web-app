import { CreditFeatureMode, Prisma, type CreditPlatform } from "@prisma/client";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { logCredit, logCreditError } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { assertSlug } from "../../lib/slug.js";
import { getCreditAdapter, hasCreditAdapter, listCreditAdapters } from "./registry.js";
import {
  CreditAdapterError,
  type CreditBalance,
  type CreditUser,
} from "./types.js";

export interface CreateCreditPlatformInput {
  name: string;
  slug: string;
  logoUrl: string;
  adapterKey: string;
  config?: unknown;
  installmentsMode?: CreditFeatureMode;
  installmentsUrl?: string | null;
  merchantsMode?: CreditFeatureMode;
  merchantsUrl?: string | null;
  launchUrl?: string | null;
  instructions?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateCreditPlatformInput = Partial<
  Omit<CreateCreditPlatformInput, "config">
> & {
  config?: unknown;
};

type PlatformRow = CreditPlatform;

function decryptConfig(encryptedConfig: string): unknown {
  try {
    const raw = decrypt(encryptedConfig);
    const parsed = JSON.parse(raw) as unknown;
    logCredit("Decrypted platform config", {
      step: "decryptConfig",
      configKeys:
        parsed && typeof parsed === "object" ? Object.keys(parsed as object) : typeof parsed,
    });
    return parsed;
  } catch (error) {
    logCreditError("Failed to decrypt/parse platform config", {
      step: "decryptConfig",
      error: String(error),
    });
    throw new AppError("پیکربندی پلتفرم نامعتبر است", 500);
  }
}

function encryptConfig(config: unknown): string {
  return encrypt(JSON.stringify(config ?? {}));
}

function mapAdapterError(error: unknown): never {
  if (error instanceof CreditAdapterError) {
    logCreditError("Mapped CreditAdapterError", {
      step: "mapAdapterError",
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    });
    if (error.code === "USER_NOT_FOUND") {
      throw new AppError("اعتباری برای این کاربر در این پلتفرم یافت نشد", 404);
    }
    if (error.code === "UNAUTHORIZED") {
      throw new AppError("دسترسی به سرویس پلتفرم مجاز نیست", 502);
    }
    if (error.code === "INVALID_RESPONSE") {
      throw new AppError("پاسخ نامعتبر از سرویس پلتفرم", 502);
    }
    throw new AppError(error.message || "سرویس پلتفرم در دسترس نیست", error.statusCode || 502);
  }
  if (error instanceof AppError) {
    logCreditError("Mapped AppError from adapter path", {
      step: "mapAdapterError",
      message: error.message,
      statusCode: error.statusCode,
    });
    throw error;
  }
  logCreditError("Mapped unknown adapter error", {
    step: "mapAdapterError",
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  throw new AppError("خطا در ارتباط با سرویس پلتفرم", 502);
}

function assertFeatureModeAllowed(
  mode: CreditFeatureMode,
  capability: boolean,
  featureLabel: string,
) {
  if (mode === CreditFeatureMode.API && !capability) {
    throw new AppError(`آداپتر انتخاب‌شده از ${featureLabel} پشتیبانی نمی‌کند`, 400);
  }
}

function assertRedirectUrl(mode: CreditFeatureMode, url: string | null | undefined, label: string) {
  if (mode === CreditFeatureMode.REDIRECT && !url?.trim()) {
    throw new AppError(`برای حالت هدایت ${label} آدرس الزامی است`, 400);
  }
}

function validateAdapterConfig(adapterKey: string, config: unknown) {
  const adapter = getCreditAdapter(adapterKey);
  const parsed = adapter.configSchema.safeParse(config ?? {});
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length ? issue.path.join(".") : "config";
        return `${path}: ${issue.message}`;
      })
      .slice(0, 3)
      .join("؛ ");
    throw new AppError(
      details ? `پیکربندی آداپتر نامعتبر است (${details})` : "پیکربندی آداپتر نامعتبر است",
      400,
    );
  }
  return parsed.data;
}

function serializePublicPlatform(platform: PlatformRow) {
  let hasLaunch = Boolean(platform.launchUrl);
  if (hasCreditAdapter(platform.adapterKey)) {
    hasLaunch = hasLaunch || getCreditAdapter(platform.adapterKey).capabilities.launch;
  }
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    logoUrl: platform.logoUrl,
    installmentsMode: platform.installmentsMode,
    installmentsUrl: platform.installmentsUrl,
    merchantsMode: platform.merchantsMode,
    merchantsUrl: platform.merchantsUrl,
    hasLaunch,
    instructions: platform.instructions,
    sortOrder: platform.sortOrder,
  };
}

function serializeAdminPlatform(platform: PlatformRow) {
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    logoUrl: platform.logoUrl,
    adapterKey: platform.adapterKey,
    hasConfig: platform.encryptedConfig.length > 0,
    installmentsMode: platform.installmentsMode,
    installmentsUrl: platform.installmentsUrl,
    merchantsMode: platform.merchantsMode,
    merchantsUrl: platform.merchantsUrl,
    launchUrl: platform.launchUrl,
    instructions: platform.instructions,
    isActive: platform.isActive,
    sortOrder: platform.sortOrder,
    createdAt: platform.createdAt,
    updatedAt: platform.updatedAt,
  };
}

async function loadUser(userId: string): Promise<CreditUser> {
  logCredit("Loading credit user", { step: "loadUser", userId });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logCreditError("Credit user not found", { step: "loadUser", userId });
    throw new AppError("کاربر یافت نشد", 401);
  }
  logCredit("Credit user loaded", {
    step: "loadUser",
    userId: user.id,
    walletId: user.walletId,
    phone: user.phone,
    hasNationalCode: Boolean(user.nationalCode),
    nationalCodeLength: user.nationalCode?.length ?? 0,
  });
  return {
    id: user.id,
    walletId: user.walletId,
    phone: user.phone,
    name: user.name,
    family: user.family,
    nationalCode: user.nationalCode,
  };
}

async function loadActivePlatform(slug: string): Promise<PlatformRow> {
  const platform = await prisma.creditPlatform.findUnique({ where: { slug } });
  if (!platform || !platform.isActive) {
    throw new AppError("پلتفرم اعتبار یافت نشد", 404);
  }
  if (!hasCreditAdapter(platform.adapterKey)) {
    throw new AppError("آداپتر پلتفرم پیکربندی نشده است", 500);
  }
  return platform;
}

async function withAdapter<T>(
  platform: PlatformRow,
  userId: string,
  fn: (user: CreditUser, config: unknown) => Promise<T>,
): Promise<T> {
  const adapter = getCreditAdapter(platform.adapterKey);
  const user = await loadUser(userId);
  const config = decryptConfig(platform.encryptedConfig);
  try {
    return await fn(user, config);
  } catch (error) {
    mapAdapterError(error);
  }
}

export async function listCreditPlatformsWithBalances(userId: string) {
  logCredit("Listing credit platforms with balances", {
    step: "listCreditPlatformsWithBalances.start",
    userId,
  });

  const platforms = await prisma.creditPlatform.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  logCredit("Active credit platforms loaded", {
    step: "listCreditPlatformsWithBalances.platforms",
    count: platforms.length,
    platforms: platforms.map((p) => ({
      id: p.id,
      slug: p.slug,
      adapterKey: p.adapterKey,
    })),
  });

  const user = await loadUser(userId);

  const results = await Promise.allSettled(
    platforms.map(async (platform) => {
      logCredit("Fetching platform balance", {
        step: "listCreditPlatformsWithBalances.fetchBalance",
        platformId: platform.id,
        slug: platform.slug,
        adapterKey: platform.adapterKey,
      });
      try {
        const adapter = getCreditAdapter(platform.adapterKey);
        const config = decryptConfig(platform.encryptedConfig);
        const balance = await adapter.getBalance(user, config);
        logCredit("Platform balance fetched", {
          step: "listCreditPlatformsWithBalances.fetchBalance.ok",
          slug: platform.slug,
          adapterKey: platform.adapterKey,
          available: balance.available,
          currency: balance.currency,
        });
        return { platform, balance };
      } catch (error) {
        logCreditError("Platform balance fetch failed", {
          step: "listCreditPlatformsWithBalances.fetchBalance.fail",
          slug: platform.slug,
          adapterKey: platform.adapterKey,
          errorName: error instanceof Error ? error.name : typeof error,
          errorCode: error instanceof CreditAdapterError ? error.code : undefined,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }),
  );

  return results.map((result, index) => {
    const platform = platforms[index]!;
    const base = serializePublicPlatform(platform);
    if (result.status === "fulfilled") {
      return { ...base, balance: result.value.balance as CreditBalance, error: null as string | null };
    }
    const reason = result.reason;
    let error = "خطا در دریافت موجودی";
    if (reason instanceof CreditAdapterError) {
      if (reason.code === "USER_NOT_FOUND") {
        // Prefer provider message when it is already user-facing Persian text.
        error =
          /[آ-ی]/.test(reason.message) && reason.message.length < 200
            ? reason.message
            : "اعتباری برای این کاربر یافت نشد";
      } else if (reason.code === "UNAUTHORIZED") {
        error = "احراز هویت پلتفرم ناموفق بود";
      } else if (reason.code === "UNAVAILABLE") {
        error = reason.message.includes("باروک") || reason.message.includes("اتصال")
          ? reason.message
          : "سرویس پلتفرم در دسترس نیست";
      } else if (reason.code === "INVALID_RESPONSE") {
        error = "پاسخ نامعتبر از سرویس پلتفرم";
      }
    }
    logCreditError("Returning balance error for platform card", {
      step: "listCreditPlatformsWithBalances.result",
      slug: platform.slug,
      adapterKey: platform.adapterKey,
      uiError: error,
      reasonName: reason instanceof Error ? reason.name : typeof reason,
      reasonCode: reason instanceof CreditAdapterError ? reason.code : undefined,
      reasonMessage: reason instanceof Error ? reason.message : String(reason),
    });
    return { ...base, balance: null, error };
  });
}

export async function getCreditPlatformDetail(slug: string) {
  const platform = await loadActivePlatform(slug);
  return serializePublicPlatform(platform);
}

export async function getCreditBalance(userId: string, slug: string) {
  logCredit("getCreditBalance called", { step: "getCreditBalance.start", userId, slug });
  const platform = await loadActivePlatform(slug);
  const adapter = getCreditAdapter(platform.adapterKey);
  return withAdapter(platform, userId, async (user, config) => {
    logCredit("Calling adapter.getBalance", {
      step: "getCreditBalance.adapter",
      slug,
      adapterKey: platform.adapterKey,
      hasNationalCode: Boolean(user.nationalCode),
    });
    const balance = await adapter.getBalance(user, config);
    logCredit("adapter.getBalance succeeded", {
      step: "getCreditBalance.adapter.ok",
      slug,
      available: balance.available,
    });
    return balance;
  });
}

export async function getCreditTransactions(
  userId: string,
  slug: string,
  cursor?: string,
) {
  const platform = await loadActivePlatform(slug);
  const adapter = getCreditAdapter(platform.adapterKey);
  return withAdapter(platform, userId, (user, config) =>
    adapter.getTransactions(user, config, { cursor }),
  );
}

export async function getCreditInstallments(userId: string, slug: string) {
  const platform = await loadActivePlatform(slug);

  if (platform.installmentsMode === CreditFeatureMode.DISABLED) {
    throw new AppError("اقساط برای این پلتفرم فعال نیست", 404);
  }
  if (platform.installmentsMode === CreditFeatureMode.REDIRECT) {
    return { mode: "redirect" as const, url: platform.installmentsUrl! };
  }

  const adapter = getCreditAdapter(platform.adapterKey);
  if (!adapter.getInstallments) {
    throw new AppError("آداپتر از اقساط پشتیبانی نمی‌کند", 502);
  }
  const items = await withAdapter(platform, userId, (user, config) =>
    adapter.getInstallments!(user, config),
  );
  return { mode: "api" as const, items };
}

export async function getCreditMerchants(
  slug: string,
  params: { cursor?: string; query?: string },
) {
  const platform = await loadActivePlatform(slug);

  if (platform.merchantsMode === CreditFeatureMode.DISABLED) {
    throw new AppError("پذیرندگان برای این پلتفرم فعال نیست", 404);
  }
  if (platform.merchantsMode === CreditFeatureMode.REDIRECT) {
    return { mode: "redirect" as const, url: platform.merchantsUrl! };
  }

  const adapter = getCreditAdapter(platform.adapterKey);
  if (!adapter.getMerchants) {
    throw new AppError("آداپتر از پذیرندگان پشتیبانی نمی‌کند", 502);
  }
  const config = decryptConfig(platform.encryptedConfig);
  try {
    const page = await adapter.getMerchants(config, params);
    return { mode: "api" as const, ...page };
  } catch (error) {
    mapAdapterError(error);
  }
}

export async function getCreditLaunchUrl(userId: string, slug: string) {
  const platform = await loadActivePlatform(slug);
  const adapter = getCreditAdapter(platform.adapterKey);

  if (adapter.getLaunchUrl) {
    try {
      const url = await withAdapter(platform, userId, (user, config) =>
        adapter.getLaunchUrl!(user, config),
      );
      return { url };
    } catch (error) {
      if (platform.launchUrl) {
        return { url: platform.launchUrl };
      }
      throw error;
    }
  }

  if (!platform.launchUrl) {
    throw new AppError("آدرس استفاده از اعتبار تنظیم نشده است", 404);
  }
  return { url: platform.launchUrl };
}

export function listAvailableCreditAdapters() {
  return listCreditAdapters();
}

export async function listAdminCreditPlatforms() {
  const platforms = await prisma.creditPlatform.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return platforms.map(serializeAdminPlatform);
}

export async function createCreditPlatform(input: CreateCreditPlatformInput) {
  assertSlug(input.slug, "شناسه پلتفرم");
  if (!hasCreditAdapter(input.adapterKey)) {
    throw new AppError("آداپتر انتخاب‌شده معتبر نیست", 400);
  }

  const adapter = getCreditAdapter(input.adapterKey);
  const installmentsMode = input.installmentsMode ?? CreditFeatureMode.DISABLED;
  const merchantsMode = input.merchantsMode ?? CreditFeatureMode.DISABLED;

  assertFeatureModeAllowed(installmentsMode, adapter.capabilities.installments, "اقساط");
  assertFeatureModeAllowed(merchantsMode, adapter.capabilities.merchants, "پذیرندگان");
  assertRedirectUrl(installmentsMode, input.installmentsUrl, "اقساط");
  assertRedirectUrl(merchantsMode, input.merchantsUrl, "پذیرندگان");

  const config = validateAdapterConfig(input.adapterKey, input.config);

  try {
    const platform = await prisma.creditPlatform.create({
      data: {
        name: input.name.trim(),
        slug: input.slug,
        logoUrl: input.logoUrl.trim(),
        adapterKey: input.adapterKey,
        encryptedConfig: encryptConfig(config),
        installmentsMode,
        installmentsUrl: input.installmentsUrl?.trim() || null,
        merchantsMode,
        merchantsUrl: input.merchantsUrl?.trim() || null,
        launchUrl: input.launchUrl?.trim() || null,
        instructions: input.instructions ?? "",
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
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

export async function updateCreditPlatform(id: string, input: UpdateCreditPlatformInput) {
  const existing = await prisma.creditPlatform.findUnique({ where: { id } });
  if (!existing) throw new AppError("پلتفرم یافت نشد", 404);

  if (input.slug) assertSlug(input.slug, "شناسه پلتفرم");

  const adapterKey = input.adapterKey ?? existing.adapterKey;
  if (!hasCreditAdapter(adapterKey)) {
    throw new AppError("آداپتر انتخاب‌شده معتبر نیست", 400);
  }

  const adapter = getCreditAdapter(adapterKey);
  const installmentsMode = input.installmentsMode ?? existing.installmentsMode;
  const merchantsMode = input.merchantsMode ?? existing.merchantsMode;
  const installmentsUrl =
    input.installmentsUrl !== undefined ? input.installmentsUrl : existing.installmentsUrl;
  const merchantsUrl = input.merchantsUrl !== undefined ? input.merchantsUrl : existing.merchantsUrl;

  assertFeatureModeAllowed(installmentsMode, adapter.capabilities.installments, "اقساط");
  assertFeatureModeAllowed(merchantsMode, adapter.capabilities.merchants, "پذیرندگان");
  assertRedirectUrl(installmentsMode, installmentsUrl, "اقساط");
  assertRedirectUrl(merchantsMode, merchantsUrl, "پذیرندگان");

  let encryptedConfig: string | undefined;
  if (input.config !== undefined) {
    const config = validateAdapterConfig(adapterKey, input.config);
    encryptedConfig = encryptConfig(config);
  } else if (input.adapterKey && input.adapterKey !== existing.adapterKey) {
    throw new AppError("با تغییر آداپتر، پیکربندی جدید الزامی است", 400);
  }

  try {
    const platform = await prisma.creditPlatform.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl.trim() } : {}),
        ...(input.adapterKey !== undefined ? { adapterKey: input.adapterKey } : {}),
        ...(encryptedConfig !== undefined ? { encryptedConfig } : {}),
        ...(input.installmentsMode !== undefined ? { installmentsMode: input.installmentsMode } : {}),
        ...(input.installmentsUrl !== undefined
          ? { installmentsUrl: input.installmentsUrl?.trim() || null }
          : {}),
        ...(input.merchantsMode !== undefined ? { merchantsMode: input.merchantsMode } : {}),
        ...(input.merchantsUrl !== undefined
          ? { merchantsUrl: input.merchantsUrl?.trim() || null }
          : {}),
        ...(input.launchUrl !== undefined ? { launchUrl: input.launchUrl?.trim() || null } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
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

export async function deleteCreditPlatform(id: string) {
  const existing = await prisma.creditPlatform.findUnique({ where: { id } });
  if (!existing) throw new AppError("پلتفرم یافت نشد", 404);
  await prisma.creditPlatform.delete({ where: { id } });
}
