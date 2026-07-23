import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { initiatePayment, verifyPayment } from "../services/order.service.js";
import { sendSuccess } from "../lib/response.js";

const verifyPaymentSchema = z.object({
  pt: z.string().min(1),
  pn: z.string().min(1),
  st: z.string().min(1),
});

export async function payInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await initiatePayment(String(req.params.id), req.user!.userId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function verifyPaymentCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { pt, pn, st } = verifyPaymentSchema.parse(req.body);
    const result = await verifyPayment(pt, pn, st);
    sendSuccess(res, result, result.success ? "پرداخت موفق" : "پرداخت ناموفق");
  } catch (error) {
    next(error);
  }
}
