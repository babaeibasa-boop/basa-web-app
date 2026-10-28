import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { decrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { isDeveloperPhone } from "../lib/developer-access.js";
import { maskMobile, isValidNationalCode, parseNationalCode, toPublicUser } from "../lib/national-code.js";
import { normalizePhone, parseLoginPhone, phoneLookupVariants } from "../lib/phone.js";
import { walletService } from "./wallet.service.js";
import { verifyCaptcha } from "./captcha.service.js";
import { smsService } from "./sms.service.js";
import { signUserToken } from "../middleware/auth.js";
import { logAuth } from "../lib/logger.js";

export type WalletAuthScope = "credits";

export const OTP_TTL_MS = 90_000;
export const OTP_EXPIRES_IN_SECONDS = 90;
const OTP_MAX_ATTEMPTS = 5;
const OTP_CODE_LENGTH = 6;
const OTP_CODE_PATTERN = /^\d{6}$/;
const MAX_OTP_STORE_SIZE = 20_000;
const PURGE_INTERVAL_MS = 30_000;

interface OtpChallenge {
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpChallenge>();
let lastOtpPurgeAt = 0;

function hashOtp(code: string): string {
  return createHmac("sha256", config.userJwtSecret).update(`otp:${code}`).digest("hex");
}

function generateOtpCode(): string {
  const max = 10 ** OTP_CODE_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_CODE_LENGTH, "0");
}

function purgeExpiredOtps(force = false): void {
  const now = Date.now();
  if (!force && now - lastOtpPurgeAt < PURGE_INTERVAL_MS && otpStore.size < MAX_OTP_STORE_SIZE) {
    return;
  }
  lastOtpPurgeAt = now;
  for (const [phone, challenge] of otpStore) {
    if (challenge.expiresAt <= now) {
      otpStore.delete(phone);
    }
  }
}

function getActiveOtp(phone: string): OtpChallenge | null {
  const challenge = otpStore.get(phone);
  if (!challenge) return null;
  if (challenge.expiresAt <= Date.now()) {
    otpStore.delete(phone);
    return null;
  }
  return challenge;
}

async function resolveWalletPwd(platformSlug?: string, walletScope?: WalletAuthScope) {
  if (walletScope === "credits") return config.walletCreditsApiToken;
  if (!platformSlug) return undefined;

  const platform = await prisma.voucherPlatform.findUnique({ where: { slug: platformSlug } });
  if (!platform) {
    throw new AppError("پلتفرم یافت نشد", 404);
  }

  try {
    return decrypt(platform.encryptedApiKey);
  } catch {
    throw new AppError("کلید درگاه پلتفرم نامعتبر است", 500);
  }
}

async function findUserByPhoneVariants(canonicalPhone: string) {
  const exact = await prisma.user.findUnique({ where: { phone: canonicalPhone } });
  if (exact) return exact;

  const variants = phoneLookupVariants(canonicalPhone).filter((value) => value !== canonicalPhone);
  if (variants.length === 0) return null;

  return prisma.user.findFirst({
    where: { phone: { in: variants } },
  });
}

function isOtpPlaceholderWalletId(walletId: string): boolean {
  return walletId.startsWith("otp:");
}

/**
 * Link wallet login to an existing OTP-created user (same phone), or upsert by walletId.
 * Only merges when the phone owner is an OTP placeholder account — never hijack another wallet user.
 */
export async function authenticateWithWalletToken(
  ut: string,
  platformSlug?: string,
  walletScope?: WalletAuthScope,
) {
  const pwd = await resolveWalletPwd(platformSlug, walletScope);
  const walletUser = await walletService.getUserInfo(ut, pwd);
  const rawNationalCode = walletUser.national_code || walletUser.nationalCode;
  const nationalCode = isValidNationalCode(rawNationalCode)
    ? parseNationalCode(String(rawNationalCode))
    : undefined;

  const canonicalPhone = normalizePhone(walletUser.phone) || walletUser.phone;

  const existingByWallet = await prisma.user.findUnique({
    where: { walletId: walletUser.user_id },
  });

  let user;
  if (existingByWallet) {
    user = await prisma.user.update({
      where: { id: existingByWallet.id },
      data: {
        name: walletUser.name,
        family: walletUser.family,
        phone: canonicalPhone,
        walletToken: ut,
        ...(nationalCode ? { nationalCode } : {}),
      },
    });
  } else {
    const existingByPhone = await findUserByPhoneVariants(canonicalPhone);
    if (existingByPhone && isOtpPlaceholderWalletId(existingByPhone.walletId)) {
      user = await prisma.user.update({
        where: { id: existingByPhone.id },
        data: {
          walletId: walletUser.user_id,
          name: walletUser.name,
          family: walletUser.family,
          phone: canonicalPhone,
          walletToken: ut,
          ...(nationalCode ? { nationalCode } : {}),
        },
      });
    } else if (existingByPhone) {
      throw new AppError("این شماره موبایل قبلاً با حساب دیگری ثبت شده است", 409);
    } else {
      try {
        user = await prisma.user.create({
          data: {
            walletId: walletUser.user_id,
            name: walletUser.name,
            family: walletUser.family,
            phone: canonicalPhone,
            walletToken: ut,
            ...(nationalCode ? { nationalCode } : {}),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const raced = await findUserByPhoneVariants(canonicalPhone);
          if (raced) {
            throw new AppError("این شماره موبایل قبلاً با حساب دیگری ثبت شده است", 409);
          }
        }
        throw error;
      }
    }
  }

  const token = signUserToken({ userId: user.id, walletId: user.walletId });

  return {
    token,
    user: await toPublicUserWithAccess(user),
  };
}

async function toPublicUserWithAccess(user: {
  id: string;
  name: string;
  family: string;
  phone: string;
  nationalCode?: string | null;
}) {
  return {
    ...toPublicUser(user),
    isDeveloper: await isDeveloperPhone(user.phone),
  };
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, family: true, phone: true, nationalCode: true },
  });
  if (!user) {
    throw new AppError("کاربر یافت نشد", 401);
  }
  return toPublicUserWithAccess(user);
}

export async function requestOtp(
  rawPhone: string,
  captchaId: string,
  captchaCode: string,
): Promise<{ expiresIn: number }> {
  // Validate phone + cooldown before consuming captcha (avoids burning captchas on cooldown).
  const phone = parseLoginPhone(rawPhone);
  purgeExpiredOtps();

  const existing = getActiveOtp(phone);
  if (existing) {
    const remainingSec = Math.ceil((existing.expiresAt - Date.now()) / 1000);
    throw new AppError(
      `لطفاً ${remainingSec} ثانیه صبر کنید و سپس دوباره درخواست دهید`,
      429,
    );
  }

  verifyCaptcha(captchaId, captchaCode);

  if (otpStore.size >= MAX_OTP_STORE_SIZE) {
    purgeExpiredOtps(true);
  }
  if (otpStore.size >= MAX_OTP_STORE_SIZE) {
    throw new AppError("سرویس موقتاً در دسترس نیست. لطفاً کمی بعد تلاش کنید", 503);
  }

  const code = generateOtpCode();
  otpStore.set(phone, {
    codeHash: hashOtp(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  try {
    await smsService.sendOtp(phone, code);
  } catch (error) {
    otpStore.delete(phone);
    throw error;
  }

  logAuth("OTP requested", { phone: maskMobile(phone) });
  return { expiresIn: OTP_EXPIRES_IN_SECONDS };
}

export async function verifyOtp(rawPhone: string, code: string) {
  const phone = parseLoginPhone(rawPhone);
  const normalizedCode = code.trim();

  if (!OTP_CODE_PATTERN.test(normalizedCode)) {
    throw new AppError("کد تایید نامعتبر است", 400);
  }

  const challenge = getActiveOtp(phone);
  if (!challenge) {
    throw new AppError("کد تایید منقضی شده است. لطفاً دوباره درخواست دهید", 400);
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(phone);
    throw new AppError("تعداد تلاش‌ها بیش از حد مجاز است. لطفاً دوباره درخواست دهید", 400);
  }

  const expected = Buffer.from(challenge.codeHash, "hex");
  const actual = Buffer.from(hashOtp(normalizedCode), "hex");
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    challenge.attempts += 1;
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(phone);
      throw new AppError("تعداد تلاش‌ها بیش از حد مجاز است. لطفاً دوباره درخواست دهید", 400);
    }
    throw new AppError("کد تایید نادرست است", 400);
  }

  otpStore.delete(phone);

  let user = await findUserByPhoneVariants(phone);
  if (!user) {
    try {
      user = await prisma.user.create({
        data: {
          walletId: `otp:${phone}`,
          phone,
          name: "",
          family: "",
          walletToken: "",
        },
      });
      logAuth("OTP user created", { userId: user.id, phone: maskMobile(phone) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        user = await findUserByPhoneVariants(phone);
        if (!user) throw error;
      } else {
        throw error;
      }
    }
  } else if (user.phone !== phone) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { phone },
    });
  }

  const token = signUserToken({ userId: user.id, walletId: user.walletId });
  logAuth("User authenticated via OTP", { userId: user.id, phone: maskMobile(phone) });

  return {
    token,
    user: await toPublicUserWithAccess(user),
  };
}

/** Test helper: clear OTP store. */
export function clearOtpStore(): void {
  otpStore.clear();
  lastOtpPurgeAt = 0;
}

/** Test helper: inject an OTP challenge. */
export function setOtpForTests(
  phone: string,
  code: string,
  expiresAt = Date.now() + OTP_TTL_MS,
): void {
  otpStore.set(phone, {
    codeHash: hashOtp(code),
    expiresAt,
    attempts: 0,
  });
}
