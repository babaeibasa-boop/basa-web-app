import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticateWithWalletToken, getUserProfile } from "../services/auth.service.js";
import { sendSuccess } from "../lib/response.js";

const walletAuthSchema = z.object({ ut: z.string().min(1, "توکن کیف پول الزامی است") });

export async function walletAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const { ut } = walletAuthSchema.parse(req.body);
    const result = await authenticateWithWalletToken(ut);
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
