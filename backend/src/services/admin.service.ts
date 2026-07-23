import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { signAdminToken } from "../middleware/auth.js";
import { AppError } from "../lib/errors.js";
import { logAuth } from "../lib/logger.js";

export async function adminLogin(username: string, password: string) {
  const admin = await prisma.admin.findUnique({
    where: { username },
    include: { phones: true },
  });

  if (!admin) {
    throw new AppError("نام کاربری یا رمز عبور اشتباه است", 401);
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    throw new AppError("نام کاربری یا رمز عبور اشتباه است", 401);
  }

  const token = signAdminToken({ adminId: admin.id, username: admin.username });
  logAuth("Admin logged in", { adminId: admin.id });

  return {
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      phones: admin.phones,
    },
  };
}

export async function getAdminPhones() {
  return prisma.adminPhone.findMany({ include: { admin: { select: { fullName: true } } } });
}

export async function addAdminPhone(adminId: string, phone: string) {
  return prisma.adminPhone.create({ data: { adminId, phone } });
}

export async function removeAdminPhone(phoneId: string) {
  await prisma.adminPhone.delete({ where: { id: phoneId } });
}

export async function getAdminProfile(adminId: string) {
  return prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, username: true, fullName: true, phones: true },
  });
}
