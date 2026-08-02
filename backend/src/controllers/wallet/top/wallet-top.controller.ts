import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  checkUserExists,
  createPurchase,
  getUserWallets,
  getWallet,
  inquiry,
  reverseTransaction,
  reverseTransactionPartial,
} from "../../../services/wallet/top/wallet-top-mock.service.js";

export const mobileNumberQuerySchema = z.object({
  MobileNumber: z.string().trim().min(1),
});

export const walletCodeQuerySchema = z.object({
  WalletCode: z.string().trim().min(1),
});

export const createPurchaseBodySchema = z.object({
  WalletCode: z.string().trim().min(1),
  Amount: z.number().gt(0),
  MerchantBrandName: z.string().trim().min(1),
  MerchantClientCode: z.string().trim().min(1),
  ReferenceCode: z.string().trim().min(1),
});

export const reverseTransactionBodySchema = z.object({
  ReferenceCode: z.string().trim().min(1),
});

export const reverseTransactionPartialBodySchema = z.object({
  ReferenceCode: z.string().trim().min(1),
  Amount: z.number().gt(0),
});

export const inquiryQuerySchema = z.object({
  ReferenceCode: z.string().trim().min(1),
});

function sendInvalidInput(res: Response): void {
  res.status(422).json({ error_status: "INVALID_INPUT" });
}

function parseInput<T>(schema: z.ZodType<T>, data: unknown, res: Response): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    sendInvalidInput(res);
    return null;
  }
  return result.data;
}

export async function isUserExists(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseInput(mobileNumberQuerySchema, req.query, res);
    if (!query) return;
    const result = await checkUserExists(query.MobileNumber);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getUserWalletsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseInput(mobileNumberQuerySchema, req.query, res);
    if (!query) return;
    const result = await getUserWallets(query.MobileNumber);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseInput(walletCodeQuerySchema, req.query, res);
    if (!query) return;
    const result = await getWallet(query.WalletCode);
    if (!result) {
      sendInvalidInput(res);
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createPurchaseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = parseInput(createPurchaseBodySchema, req.body, res);
    if (!input) return;
    const result = await createPurchase(input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function reverseTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = parseInput(reverseTransactionBodySchema, req.body, res);
    if (!input) return;
    const result = await reverseTransaction(input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function reverseTransactionPartialHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = parseInput(reverseTransactionPartialBodySchema, req.body, res);
    if (!input) return;
    const result = await reverseTransactionPartial(input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function inquiryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseInput(inquiryQuerySchema, req.query, res);
    if (!query) return;
    const result = await inquiry(query.ReferenceCode);
    if (!result) {
      sendInvalidInput(res);
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
