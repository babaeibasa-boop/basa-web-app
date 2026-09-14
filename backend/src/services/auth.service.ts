import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { walletService } from "./wallet.service.js";
import { signUserToken } from "../middleware/auth.js";
import { logAuth } from "../lib/logger.js";

async function resolvePlatformPwd(platformSlug?: string) {
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

export async function authenticateWithWalletToken(ut: string, platformSlug?: string) {
  console.log("platformSlug", platformSlug);
  const pwd = await resolvePlatformPwd(platformSlug);
  const walletUser = await walletService.getUserInfo(ut, pwd);

  const user = await prisma.user.upsert({
    where: { walletId: walletUser.user_id },
    update: {
      name: walletUser.name,
      family: walletUser.family,
      phone: walletUser.phone,
      walletToken: ut,
    },
    create: {
      walletId: walletUser.user_id,
      name: walletUser.name,
      family: walletUser.family,
      phone: walletUser.phone,
      walletToken: ut,
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
    user: {
      id: user.id,
      name: user.name,
      family: user.family,
      phone: user.phone,
    },
  };
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, family: true, phone: true },
  });
  return user;
}
