import axios from "axios";
import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { AppError } from "../lib/errors.js";
import { logCredit, logCreditError, logExternalError } from "../lib/logger.js";
import {
  isValidNationalCode,
  maskMobile,
  parseNationalCode,
  toPublicUser,
} from "../lib/national-code.js";

const MATCH_TIMEOUT_MS = 15_000;

interface MatchApiResponse {
  result?: unknown;
  response_body?: {
    data?: {
      matched?: unknown;
    };
  };
}

async function matchNationalCodeWithMobile(
  userId: string,
  mobile: string,
  nationalCode: string,
): Promise<boolean> {
  const url = config.nationalCodeMatchUrl.trim();
  const token = config.nationalCodeMatchToken.trim();
  if (!url || !token) {
    logCreditError("National code match service is not configured", { userId });
    throw new AppError("سرویس استعلام کد ملی پیکربندی نشده است", 503);
  }

  try {
    const { data } = await axios.post<MatchApiResponse>(
      url,
      { mobile, national_code: nationalCode },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: MATCH_TIMEOUT_MS,
      },
    );

    const matched = data?.response_body?.data?.matched;
    if (matched === false) return false;
    if (data?.result === 1 && matched === true) return true;

    logExternalError("National code match API unexpected response", { userId });
    throw new AppError("خطا در استعلام کد ملی. لطفاً دوباره تلاش کنید", 502);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logExternalError("National code match API failed", { userId, error: String(error) });
    return false;
  }
}

export async function submitNationalCode(userId: string, nationalCodeRaw: string) {
  const nationalCode = parseNationalCode(nationalCodeRaw);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("کاربر یافت نشد", 401);
  }

  if (isValidNationalCode(user.nationalCode)) {
    logCredit("National code already stored", { userId, matched: true });
    return toPublicUser(user);
  }

  const matched = await matchNationalCodeWithMobile(userId, user.phone, nationalCode);
  logCredit("National code match result", { userId, matched });

  if (!matched) {
    throw new AppError(
      `کد ملی وارد شده با شماره موبایل ${maskMobile(user.phone)} مطابقت ندارد`,
      400,
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { nationalCode },
  });

  return toPublicUser(updated);
}
