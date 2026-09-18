import { prisma } from "../lib/prisma.js";

export const HIDE_VOUCHERS_EXPIRING_SOON_KEY = "hideVouchersExpiringSoon";

export interface AdminSettings {
  hideVouchersExpiringSoon: boolean;
}

export async function isHideVouchersExpiringSoonEnabled() {
  const row = await prisma.appSetting.findUnique({
    where: { key: HIDE_VOUCHERS_EXPIRING_SOON_KEY },
  });
  if (!row) return true;
  return row.value !== "false";
}

export async function getAdminSettings(): Promise<AdminSettings> {
  return {
    hideVouchersExpiringSoon: await isHideVouchersExpiringSoonEnabled(),
  };
}

export async function updateAdminSettings(input: { hideVouchersExpiringSoon?: boolean }) {
  if (input.hideVouchersExpiringSoon !== undefined) {
    const value = input.hideVouchersExpiringSoon ? "true" : "false";
    await prisma.appSetting.upsert({
      where: { key: HIDE_VOUCHERS_EXPIRING_SOON_KEY },
      create: { key: HIDE_VOUCHERS_EXPIRING_SOON_KEY, value },
      update: { value },
    });
  }
  return getAdminSettings();
}
