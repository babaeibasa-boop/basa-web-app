import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { decrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { isValidNationalCode, parseNationalCode, toPublicUser } from "../lib/national-code.js";
import { walletService } from "./wallet.service.js";
import { signUserToken } from "../middleware/auth.js";
import { logAuth } from "../lib/logger.js";

export type WalletAuthScope = "credits";

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

  const user = await prisma.user.upsert({
    where: { walletId: walletUser.user_id },
    update: {
      name: walletUser.name,
      family: walletUser.family,
      phone: walletUser.phone,
      walletToken: ut,
      ...(nationalCode ? { nationalCode } : {}),
    },
    create: {
      walletId: walletUser.user_id,
      name: walletUser.name,
      family: walletUser.family,
      phone: walletUser.phone,
      walletToken: ut,
      ...(nationalCode ? { nationalCode } : {}),
    },
  });

  const token = signUserToken({ userId: user.id, walletId: user.walletId });
  logAuth("User authenticated via wallet", {
    userId: user.id,
    walletId: user.walletId,
    platformSlug,
  });

  return {
    token,
    user: toPublicUser(user),
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
  return toPublicUser(user);
}
