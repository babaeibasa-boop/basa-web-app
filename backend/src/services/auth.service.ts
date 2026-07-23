import { prisma } from "../lib/prisma.js";
import { walletService } from "./wallet.service.js";
import { signUserToken } from "../middleware/auth.js";
import { logAuth } from "../lib/logger.js";

export async function authenticateWithWalletToken(ut: string) {
  const walletUser = await walletService.getUserInfo(ut);
  
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
  logAuth("User authenticated via wallet", { userId: user.id, walletId: user.walletId });

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
