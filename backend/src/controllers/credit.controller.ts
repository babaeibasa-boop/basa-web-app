import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sendSuccess } from "../lib/response.js";
import { normalizeDigits } from "../lib/digits.js";
import { submitNationalCode } from "../services/national-code.service.js";
import {
  getCreditBalance,
  getCreditInstallments,
  getCreditLaunchUrl,
  getCreditMerchants,
  getCreditPlatformDetail,
  getCreditTransactions,
  listCreditPlatformsWithBalances,
} from "../services/credit/credit.service.js";

const nationalCodeSchema = z.object({
  nationalCode: z
    .string({ required_error: "کد ملی الزامی است" })
    .transform((value) => normalizeDigits(value.trim()))
    .refine((value) => /^\d{10}$/.test(value), { message: "کد ملی باید ۱۰ رقم باشد" }),
});

export async function listPlatforms(req: Request, res: Response, next: NextFunction) {
  try {
    const platforms = await listCreditPlatformsWithBalances(req.user!.userId);
    sendSuccess(res, platforms);
  } catch (error) {
    next(error);
  }
}

export async function getPlatform(req: Request, res: Response, next: NextFunction) {
  try {
    const platform = await getCreditPlatformDetail(req.user!.userId, String(req.params.slug));
    sendSuccess(res, platform);
  } catch (error) {
    next(error);
  }
}

export async function getBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const balance = await getCreditBalance(req.user!.userId, String(req.params.slug));
    sendSuccess(res, balance);
  } catch (error) {
    next(error);
  }
}

export async function getTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const cursor =
      typeof req.query.cursor === "string" && req.query.cursor.trim()
        ? req.query.cursor.trim()
        : undefined;
    const result = await getCreditTransactions(req.user!.userId, String(req.params.slug), cursor);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getInstallments(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getCreditInstallments(req.user!.userId, String(req.params.slug));
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getMerchants(req: Request, res: Response, next: NextFunction) {
  try {
    const cursor =
      typeof req.query.cursor === "string" && req.query.cursor.trim()
        ? req.query.cursor.trim()
        : undefined;
    const query =
      typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
    const result = await getCreditMerchants(req.user!.userId, String(req.params.slug), { cursor, query });
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function launch(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getCreditLaunchUrl(req.user!.userId, String(req.params.slug));
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function saveNationalCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { nationalCode } = nationalCodeSchema.parse(req.body);
    const user = await submitNationalCode(req.user!.userId, nationalCode);
    sendSuccess(res, user, "کد ملی با موفقیت ثبت شد");
  } catch (error) {
    next(error);
  }
}
