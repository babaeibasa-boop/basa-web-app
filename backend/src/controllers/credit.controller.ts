import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../lib/response.js";
import {
  getCreditBalance,
  getCreditInstallments,
  getCreditLaunchUrl,
  getCreditMerchants,
  getCreditPlatformDetail,
  getCreditTransactions,
  listCreditPlatformsWithBalances,
} from "../services/credit/credit.service.js";

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
    const platform = await getCreditPlatformDetail(String(req.params.slug));
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
    const result = await getCreditMerchants(String(req.params.slug), { cursor, query });
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
