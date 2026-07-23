import type { Request, Response, NextFunction } from "express";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import {
  searchOrders,
  searchUsers,
  getDashboardStats,
  getOrderById,
  updateOrderStatus,
  updateOrderAmount,
  serializeAdminOrder,
  serializeOrders,
} from "../services/order.service.js";
import {
  adminLogin,
  getAdminProfile,
  getAdminPhones,
  addAdminPhone,
  removeAdminPhone,
} from "../services/admin.service.js";
import { sendSuccess } from "../lib/response.js";
import { parseDigitString } from "../lib/digits.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

const updateAmountSchema = z.object({
  amount: z.preprocess(
    (value) => (typeof value === "string" ? parseDigitString(value) : value),
    z.string().regex(/^\d+$/, "مبلغ باید عدد باشد"),
  ),
});

const addPhoneSchema = z.object({
  phone: z.string().min(10),
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const result = await adminLogin(username, password);
    sendSuccess(res, result, "ورود موفق");
  } catch (error) {
    next(error);
  }
}

export async function profile(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await getAdminProfile(req.admin!.adminId);
    sendSuccess(res, admin);
  } catch (error) {
    next(error);
  }
}

export async function dashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getDashboardStats();
    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
}

export async function orders(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as OrderStatus | undefined;
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await searchOrders({ status, search, page, limit });
    sendSuccess(res, {
      ...result,
      orders: serializeOrders(result.orders),
    });
  } catch (error) {
    next(error);
  }
}

export async function orderDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await getOrderById(String(req.params.id));
    sendSuccess(res, serializeAdminOrder(order));
  } catch (error) {
    next(error);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateStatusSchema.parse(req.body);
    await updateOrderStatus(String(req.params.id), status);
    const order = await getOrderById(String(req.params.id));
    sendSuccess(res, serializeAdminOrder(order), "وضعیت سفارش بروزرسانی شد");
  } catch (error) {
    next(error);
  }
}

export async function updateAmount(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount } = updateAmountSchema.parse(req.body);
    const order = await updateOrderAmount(String(req.params.id), BigInt(amount));
    sendSuccess(res, serializeAdminOrder(order), "مبلغ سفارش بروزرسانی شد");
  } catch (error) {
    next(error);
  }
}

export async function users(req: Request, res: Response, next: NextFunction) {
  try {
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await searchUsers(search, page, limit);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function phones(req: Request, res: Response, next: NextFunction) {
  try {
    const adminPhones = await getAdminPhones();
    sendSuccess(res, adminPhones);
  } catch (error) {
    next(error);
  }
}

export async function addPhone(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone } = addPhoneSchema.parse(req.body);
    const result = await addAdminPhone(req.admin!.adminId, phone);
    sendSuccess(res, result, "شماره اضافه شد", 201);
  } catch (error) {
    next(error);
  }
}

export async function deletePhone(req: Request, res: Response, next: NextFunction) {
  try {
    await removeAdminPhone(String(req.params.id));
    sendSuccess(res, null, "شماره حذف شد");
  } catch (error) {
    next(error);
  }
}
