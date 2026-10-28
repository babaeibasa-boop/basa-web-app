import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  authenticateWithWalletToken,
  getUserProfile,
  requestOtp,
  verifyOtp,
} from "../services/auth.service.js";
import { createCaptcha } from "../services/captcha.service.js";
import { sendSuccess } from "../lib/response.js";

const walletAuthSchema = z.object({
  ut: z.string().min(1, "توکن کیف پول الزامی است"),
  platformSlug: z.string().min(1).optional(),
  walletScope: z.enum(["credits"]).optional(),
});

const otpRequestSchema = z.object({
  phone: z.string().min(1, "شماره موبایل الزامی است"),
  captchaId: z.string().min(1, "کپچا الزامی است"),
  captchaCode: z.string().min(1, "کد کپچا الزامی است"),
});

const otpVerifySchema = z.object({
  phone: z.string().min(1, "شماره موبایل الزامی است"),
  code: z.string().min(1, "کد تایید الزامی است"),
});

export async function walletAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const { ut, platformSlug, walletScope } = walletAuthSchema.parse(req.body);
    const result = await authenticateWithWalletToken(ut, platformSlug, walletScope);
    sendSuccess(res, result, "ورود موفق");
  } catch (error) {
    next(error);
  }
}

export async function getCaptcha(_req: Request, res: Response, next: NextFunction) {
  try {
    const captcha = createCaptcha();
    sendSuccess(res, captcha);
  } catch (error) {
    next(error);
  }
}

export async function otpRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, captchaId, captchaCode } = otpRequestSchema.parse(req.body);
    const result = await requestOtp(phone, captchaId, captchaCode);
    sendSuccess(res, result, "کد تایید ارسال شد");
  } catch (error) {
    next(error);
  }
}

export async function otpVerify(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, code } = otpVerifySchema.parse(req.body);
    const result = await verifyOtp(phone, code);
    sendSuccess(res, result, "ورود موفق");
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getUserProfile(req.user!.userId);
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}
