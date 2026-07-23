import type { Request, Response, NextFunction } from "express";
import { AiModel } from "@prisma/client";
import { z } from "zod";
import {
  createOrder,
  getUserOrders,
  getOrderById,
  serializeOrder,
  serializeOrders,
} from "../services/order.service.js";
import { getSubscriptionPlans } from "../services/subscription.service.js";
import { sendSuccess } from "../lib/response.js";

const createOrderSchema = z.object({
  aiModel: z.nativeEnum(AiModel),
  selectedPlan: z.string().min(1),
  credentials: z.record(z.string()),
});

export async function listPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const aiModel = req.params.model as AiModel;
    const plans = await getSubscriptionPlans(aiModel);
    sendSuccess(res, plans);
  } catch (error) {
    next(error);
  }
}

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const orders = await getUserOrders(req.user!.userId);
    sendSuccess(res, serializeOrders(orders));
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await getOrderById(String(req.params.id), req.user!.userId);
    sendSuccess(res, serializeOrder(order));
  } catch (error) {
    next(error);
  }
}

export async function createNewOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createOrderSchema.parse(req.body);
    const order = await createOrder({ ...input, userId: req.user!.userId });
    sendSuccess(res, serializeOrder(order), "سفارش با موفقیت ایجاد شد", 201);
  } catch (error) {
    next(error);
  }
}
