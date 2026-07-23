import { AiModel, InvoiceStatus, OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { logPayment, logRefund, logStatusChange } from "../lib/logger.js";
import { walletService } from "./wallet.service.js";
import { smsService } from "./sms.service.js";
import { getSubscriptionPlans, getPlanPrice } from "./subscription.service.js";
import { config } from "../lib/config.js";

export interface CreateOrderInput {
  userId: string;
  aiModel: AiModel;
  selectedPlan: string;
  credentials: Record<string, string>;
}

export async function createOrder(input: CreateOrderInput) {
  const product = await getSubscriptionPlans(input.aiModel);
  const plan = getPlanPrice(product, input.selectedPlan);
  if (!plan) {
    throw new AppError("پلن انتخابی معتبر نیست", 400);
  }

  const encryptedCredentials = encrypt(JSON.stringify(input.credentials));

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      aiModel: input.aiModel,
      selectedPlan: plan.title,
      selectedPlanUsdValue: plan.usdValue,
      encryptedCredentials,
      status: OrderStatus.PENDING_PAYMENT,
      invoices: {
        create: {
          amount: BigInt(plan.irrPrice),
          status: InvoiceStatus.PENDING,
        },
      },
    },
    include: { invoices: true },
  });

  return order;
}

export async function getUserOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { invoices: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderById(orderId: string, userId?: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    include: {
      invoices: { orderBy: { createdAt: "desc" } },
      user: { select: { id: true, name: true, family: true, phone: true } },
    },
  });
  if (!order) throw new AppError("سفارش یافت نشد", 404);
  return order;
}

async function syncOrderPaymentStatus(orderId: string) {
  const invoices = await prisma.invoice.findMany({ where: { orderId } });
  const allPaid = invoices.length > 0 && invoices.every((i) => i.status === InvoiceStatus.PAID);

  if (allPaid) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
      include: { user: true },
    });

    const adminPhones = await prisma.adminPhone.findMany();
    if (adminPhones.length > 0) {
      await smsService.sendAllInvoicesPaid(
        adminPhones.map((p) => p.phone),
        orderId,
      );
    }

    logStatusChange("Order marked as PAID", { orderId });
    return order;
  }

  return prisma.order.findUnique({ where: { id: orderId } });
}

export async function initiatePayment(invoiceId: string, userId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, order: { userId } },
    include: { order: { include: { user: true } } },
  });

  if (!invoice) throw new AppError("فاکتور یافت نشد", 404);
  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new AppError("این فاکتور قابل پرداخت نیست", 400);
  }
  if (invoice.order.status === OrderStatus.CANCELLED || invoice.order.status === OrderStatus.COMPLETED) {
    throw new AppError("سفارش این فاکتور قابل پرداخت نیست", 400);
  }

  const payment = await walletService.requestPayment({
    user_token: invoice.order.user.walletToken,
    amount: Number(invoice.amount),
    currency: "IRR",
    description: `پرداخت فاکتور ${invoice.id}`,
    invoice: {
      items: [
        {
          item_code: invoice.id,
          item_title: `${invoice.order.aiModel} - ${invoice.order.selectedPlan}`,
          item_count: "1",
          unit_title: "عدد",
          item_total_amount: Number(invoice.amount),
        },
      ],
    },
    callback_url: config.walletCallbackUrl,
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      paymentTrackId: payment?.payment_track_id,
    },
  });

  logPayment("Payment initiated", { invoiceId, trackId: payment?.payment_track_id });
  return { payUrl: payment?.pay_url };
}

export async function verifyPayment(
  paymentTrackId: string,
  paymentToken: string,
  status: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { paymentTrackId },
    include: { order: true },
  });

  if (!invoice) throw new AppError("فاکتور یافت نشد", 404);

  // Callback may be verified more than once (page refresh, double effect); never settle twice.
  if (invoice.status === InvoiceStatus.PAID) {
    return { success: true, orderId: invoice.orderId };
  }

  if (status === "Cancel") {
    logPayment("Payment cancelled by user", { invoiceId: invoice.id });
    return { success: false, orderId: invoice.orderId };
  }

  if (status !== "Done") {
    throw new AppError("وضعیت پرداخت نامعتبر است", 400);
  }

  const settlement = await walletService.settlePayment(paymentTrackId, paymentToken);

  if (settlement.status !== "OK" || !(settlement.data) || settlement.data.status !== "Paid") {
    logPayment("Settlement not paid", { invoiceId: invoice.id, status: settlement.status });
    return { success: false, orderId: invoice.orderId };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.PAID,
      paymentToken,
    },
  });

  logPayment("Invoice paid", { invoiceId: invoice.id });
  await syncOrderPaymentStatus(invoice.orderId);

  return { success: true, orderId: invoice.orderId };
}

function isOrderLocked(status: OrderStatus): boolean {
  return status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED;
}

function activeInvoices<T extends { status: InvoiceStatus; amount: bigint; createdAt: Date }>(
  invoices: T[],
): T[] {
  return invoices.filter(
    (invoice) => invoice.status === InvoiceStatus.PENDING || invoice.status === InvoiceStatus.PAID,
  );
}

async function refundInvoiceAmount(
  invoice: {
    id: string;
    amount: bigint;
    status: InvoiceStatus;
    paymentTrackId: string | null;
    paymentToken: string | null;
  },
  refundAmount: bigint,
  reverseType: "Total" | "Partial",
): Promise<void> {
  if (invoice.status !== InvoiceStatus.PAID) return;
  if (!invoice.paymentTrackId || !invoice.paymentToken) {
    throw new AppError("اطلاعات پرداخت فاکتور برای بازگشت وجه موجود نیست", 400);
  }

  await walletService.reversePayment(
    invoice.paymentTrackId,
    invoice.paymentToken,
    Number(refundAmount),
    reverseType,
  );
  logRefund("Refund on amount decrease", {
    invoiceId: invoice.id,
    amount: refundAmount.toString(),
    reverseType,
  });
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  const order = await getOrderById(orderId);

  if (isOrderLocked(order.status)) {
    throw new AppError("سفارش تکمیل‌شده یا لغوشده قابل تغییر نیست", 400);
  }

  if (newStatus === OrderStatus.COMPLETED) {
    if (order.status !== OrderStatus.PAID) {
      throw new AppError("فقط سفارش‌های پرداخت‌شده قابل تکمیل هستند", 400);
    }
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.COMPLETED },
      include: { user: true },
    });
    await smsService.sendOrderCompleted(updated.user.phone, orderId);
    logStatusChange("Order completed", { orderId });
    return updated;
  }

  if (newStatus === OrderStatus.CANCELLED) {
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new AppError("لغو این سفارش مجاز نیست", 400);
    }

    const paidInvoices = order.invoices.filter((i) => i.status === InvoiceStatus.PAID);

    for (const invoice of paidInvoices) {
      if (invoice.paymentTrackId && invoice.paymentToken) {
        await walletService.reversePayment(
          invoice.paymentTrackId,
          invoice.paymentToken,
          Number(invoice.amount),
          "Total",
        );
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.REFUNDED },
        });
        logRefund("Full refund on cancel", { invoiceId: invoice.id, amount: invoice.amount.toString() });
      }
    }

    await prisma.invoice.updateMany({
      where: { orderId, status: InvoiceStatus.PENDING },
      data: { status: InvoiceStatus.CANCELLED },
    });

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
    logStatusChange("Order cancelled", { orderId });
    return updated;
  }

  throw new AppError("تغییر وضعیت مجاز نیست", 400);
}

export async function updateOrderAmount(orderId: string, newAmount: bigint) {
  const order = await getOrderById(orderId);

  if (isOrderLocked(order.status)) {
    throw new AppError("سفارش تکمیل‌شده یا لغوشده قابل تغییر نیست", 400);
  }

  if (newAmount <= BigInt(0)) {
    throw new AppError("مبلغ سفارش باید بیشتر از صفر باشد", 400);
  }

  const invoices = activeInvoices(order.invoices);
  const currentTotal = invoices.reduce((sum, inv) => sum + inv.amount, BigInt(0));
  const diff = newAmount - currentTotal;

  if (diff === BigInt(0)) return order;

  if (diff > BigInt(0)) {
    if (order.status === OrderStatus.PENDING_PAYMENT) {
      const latestPending = [...invoices]
        .filter((invoice) => invoice.status === InvoiceStatus.PENDING)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      if (latestPending) {
        await prisma.invoice.update({
          where: { id: latestPending.id },
          data: { amount: latestPending.amount + diff },
        });
        logStatusChange("Order amount increased on unpaid invoice", {
          orderId,
          invoiceId: latestPending.id,
          diff: diff.toString(),
        });
        return getOrderById(orderId);
      }
    }

    await prisma.invoice.create({
      data: {
        orderId,
        amount: diff,
        status: InvoiceStatus.PENDING,
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PENDING_PAYMENT },
    });

    await smsService.sendNewInvoice(order.user.phone, diff.toString());

    logStatusChange("Order amount increased, new invoice created", { orderId, diff: diff.toString() });
    return getOrderById(orderId);
  }

  let remaining = -diff;
  const invoicesNewestFirst = [...invoices].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  for (const invoice of invoicesNewestFirst) {
    if (remaining <= BigInt(0)) break;

    if (invoice.amount <= remaining) {
      await refundInvoiceAmount(invoice, invoice.amount, "Total");
      await prisma.invoice.delete({ where: { id: invoice.id } });
      remaining -= invoice.amount;
      logStatusChange("Invoice deleted during amount decrease", {
        orderId,
        invoiceId: invoice.id,
        amount: invoice.amount.toString(),
      });
      continue;
    }

    await refundInvoiceAmount(invoice, remaining, "Partial");
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { amount: invoice.amount - remaining },
    });
    logStatusChange("Invoice reduced during amount decrease", {
      orderId,
      invoiceId: invoice.id,
      reducedBy: remaining.toString(),
    });
    remaining = BigInt(0);
  }

  if (remaining > BigInt(0)) {
    throw new AppError("مبلغ کاهش بیشتر از مجموع فاکتورهای فعال است", 400);
  }

  return getOrderById(orderId);
}

export async function searchOrders(filters: {
  status?: OrderStatus;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
        OR: [
          { id: { contains: filters.search } },
          { user: { phone: { contains: filters.search } } },
          { user: { name: { contains: filters.search, mode: "insensitive" as const } } },
        ],
      }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, family: true, phone: true } },
        invoices: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, limit };
}

export async function searchUsers(search?: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const where = search
    ? {
      OR: [
        { phone: { contains: search } },
        { name: { contains: search, mode: "insensitive" as const } },
        { family: { contains: search, mode: "insensitive" as const } },
      ],
    }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit };
}

export async function getDashboardStats() {
  const [totalOrders, pendingOrders, completedOrders, totalUsers] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: OrderStatus.PENDING_PAYMENT } }),
    prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),
    prisma.user.count(),
  ]);

  return { totalOrders, pendingOrders, completedOrders, totalUsers };
}

interface SerializableOrder {
  encryptedCredentials: string;
  invoices: { amount: bigint }[];
}

export function serializeOrder<T extends SerializableOrder>(order: T) {
  const { encryptedCredentials: _encrypted, ...orderWithoutCredentials } = order;
  return {
    ...orderWithoutCredentials,
    invoices: order.invoices.map((inv) => ({
      ...inv,
      amount: inv.amount.toString(),
    })),
  };
}

export function serializeOrders<T extends SerializableOrder>(orders: T[]) {
  return orders.map(serializeOrder);
}

export function serializeAdminOrder<T extends SerializableOrder>(order: T) {
  let credentials: Record<string, string> = {};
  try {
    credentials = JSON.parse(decrypt(order.encryptedCredentials)) as Record<string, string>;
  } catch {
    credentials = {};
  }

  return { ...serializeOrder(order), credentials };
}
