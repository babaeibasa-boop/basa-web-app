import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { parseDigitString } from "../lib/digits.js";
import { sendSuccess } from "../lib/response.js";
import {
  listPlatforms,
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
  duration: z.string().min(1),
  expiresAt: z.string().min(1),
});

export async function listVoucherPlatforms(_req: Request, res: Response, next: NextFunction) {
  try {
    const platforms = await listPlatforms();
    sendSuccess(res, platforms);
  } catch (error) {
    next(error);
  }
}

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
    const purchases = await getUserPurchases(req.user!.userId);
    sendSuccess(res, purchases);
  } catch (error) {
    next(error);
  }
}
