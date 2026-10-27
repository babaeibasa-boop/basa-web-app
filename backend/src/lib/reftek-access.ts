import { AppError } from "./errors.js";
import { isDeveloperPhone } from "./developer-access.js";
import { prisma } from "./prisma.js";

export async function assertReftekAccess(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!user) {
    throw new AppError("کاربر یافت نشد", 401);
  }
  if (!(await isDeveloperPhone(user.phone))) {
    throw new AppError("این سرویس هنوز برای شما فعال نشده است", 403);
  }
}
