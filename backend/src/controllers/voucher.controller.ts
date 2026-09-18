import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { DURATION_MONTHS_PATTERN, parseDigitString, parseDurationMonths } from "../lib/digits.js";
import { sendSuccess } from "../lib/response.js";
import {
  getPlatformOffers,
  createPurchase,
  initiateVoucherPayment,
  getUserPurchases,
} from "../services/voucher.service.js";

const createPurchaseSchema = z.object({
  platformSlug: z.string().min(1),
  amount: z.preprocess(
    (value) => (typeof value === "string" || typeof value === "number" ? parseDigitString(String(value)) : value),
    z.string().regex(/^\d+$/, "مبلغ باید عدد باشد"),
  ),
  duration: z.preprocess(
    (value) => (typeof value === "string" || typeof value === "number" ? parseDurationMonths(value) : value),
    z.string().regex(DURATION_MONTHS_PATTERN, "مدت باید تعداد ماه و فقط عدد باشد"),
  ),
});

export async function getVoucherPlatform(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getPlatformOffers(String(req.params.slug));
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function createVoucherPurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createPurchaseSchema.parse(req.body);
    const purchase = await createPurchase(req.user!.userId, input);
    sendSuccess(res, purchase, "واچر رزرو شد", 201);
  } catch (error) {
    next(error);
  }
}

export async function payVoucherPurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await initiateVoucherPayment(String(req.params.id), req.user!.userId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function listUserVoucherPurchases(req: Request, res: Response, next: NextFunction) {
  try {
    const platformSlug =
      typeof req.query.platformSlug === "string" && req.query.platformSlug.trim()
        ? req.query.platformSlug.trim()
        : undefined;
    const purchases = await getUserPurchases(req.user!.userId, platformSlug);
    sendSuccess(res, purchases);
  } catch (error) {
    next(error);
  }
}
