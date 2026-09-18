import type { Request, Response, NextFunction } from "express";
import { OrderStatus, VoucherStatus } from "@prisma/client";
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
import {
  listAdminPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
  listAdminVouchers,
  createVoucher,
  importVouchers,
  listVoucherSales,
} from "../services/voucher.service.js";
import { getAdminSettings, updateAdminSettings } from "../services/settings.service.js";
import { sendSuccess } from "../lib/response.js";
import { DURATION_MONTHS_PATTERN, parseDigitString, parseDurationMonths } from "../lib/digits.js";

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

const slugSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "شناسه پلتفرم فقط می‌تواند شامل حروف انگلیسی کوچک، عدد و خط تیره باشد"),
);

const createPlatformSchema = z.object({
  name: z.string().min(1),
  slug: slugSchema,
  logoUrl: z.string().min(1),
  apiKey: z.string().min(1),
});

const updatePlatformSchema = z.object({
  name: z.string().min(1).optional(),
  slug: slugSchema.optional(),
  logoUrl: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
});

const createVoucherSchema = z.object({
  platformId: z.string().min(1),
  amount: z.preprocess(
    (value) => (typeof value === "string" || typeof value === "number" ? parseDigitString(String(value)) : value),
    z.string().regex(/^\d+$/, "مبلغ باید عدد باشد"),
  ),
  duration: z.preprocess(
    (value) => (typeof value === "string" || typeof value === "number" ? parseDurationMonths(value) : value),
    z.string().regex(DURATION_MONTHS_PATTERN, "مدت باید تعداد ماه و فقط عدد باشد"),
  ),
  expiresAt: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value === "" || value == null ? null : value)),
  code: z.string().min(1),
});

const importVouchersSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, "فایل اکسل خالی است"),
});

const updateSettingsSchema = z.object({
  hideVouchersExpiringSoon: z.boolean().optional(),
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

export async function voucherPlatforms(_req: Request, res: Response, next: NextFunction) {
  try {
    const platforms = await listAdminPlatforms();
    sendSuccess(res, platforms);
  } catch (error) {
    next(error);
  }
}

export async function addVoucherPlatform(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createPlatformSchema.parse(req.body);
    const platform = await createPlatform(input);
    sendSuccess(res, platform, "پلتفرم اضافه شد", 201);
  } catch (error) {
    next(error);
  }
}

export async function patchVoucherPlatform(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updatePlatformSchema.parse(req.body);
    const platform = await updatePlatform(String(req.params.id), input);
    sendSuccess(res, platform, "پلتفرم بروزرسانی شد");
  } catch (error) {
    next(error);
  }
}

export async function removeVoucherPlatform(req: Request, res: Response, next: NextFunction) {
  try {
    await deletePlatform(String(req.params.id));
    sendSuccess(res, null, "پلتفرم حذف شد");
  } catch (error) {
    next(error);
  }
}

export async function vouchers(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as VoucherStatus | undefined;
    const platformId = req.query.platformId as string | undefined;
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await listAdminVouchers({ status, platformId, search, page, limit });
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function addVoucher(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createVoucherSchema.parse(req.body);
    const voucher = await createVoucher(input);
    sendSuccess(res, voucher, "واچر اضافه شد", 201);
  } catch (error) {
    next(error);
  }
}

export async function importAdminVouchers(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = importVouchersSchema.parse(req.body);
    const result = await importVouchers(rows);
    sendSuccess(res, result, `${result.created} واچر وارد شد`);
  } catch (error) {
    next(error);
  }
}

export async function settings(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAdminSettings();
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function patchSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateSettingsSchema.parse(req.body);
    const data = await updateAdminSettings(input);
    sendSuccess(res, data, "تنظیمات ذخیره شد");
  } catch (error) {
    next(error);
  }
}

export async function voucherSales(req: Request, res: Response, next: NextFunction) {
  try {
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await listVoucherSales({ search, page, limit });
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
