import axios, { type AxiosError } from "axios";
import { z } from "zod";
import { logCredit, logCreditError } from "../../../lib/logger.js";
import { isIranianMobile, normalizePhone } from "../../../lib/phone.js";
import {
  CreditAdapterError,
  type CreditAdapter,
  type CreditBalance,
  type CreditInstallment,
  type CreditTransaction,
  type CreditTransactionType,
  type CreditUser,
  type CursorPage,
} from "../types.js";

/**
 * Pinket organization member API.
 *
 * Auth: header X-Organization-Api-Key
 * Member lookup: query phoneNumber (Iranian mobile, 09…)
 *   GET {baseUrl}/wallets?phoneNumber=
 *   GET {baseUrl}/installments?phoneNumber=
 *   GET {baseUrl}/transactions?phoneNumber=&start=&len=
 *
 * Documented amount unit is Toman. Shared credit screens display Rial,
 * so amounts are multiplied by 10 unless amountInToman is false.
 */

const DEFAULT_BASE_URL = "https://pinket.com/api/v1/organization/members";

function normalizePinketBaseUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

const pinketConfigSchema = z.object({
  baseUrl: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return DEFAULT_BASE_URL;
    if (typeof value !== "string") return value;
    return normalizePinketBaseUrl(value);
  }, z.string().url()),
  apiKey: z.string().min(1),
  /** Docs state amounts are Toman. Convert to Rial for the shared UI. */
  amountInToman: z.boolean().default(true),
  /** `len` query param. Docs allow 1–100, default 20. */
  pageSize: z.number().int().min(1).max(100).default(20),
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
});

type PinketConfig = z.infer<typeof pinketConfigSchema>;

interface PinketWallet {
  uid: string;
  balance: number;
  expendableBalance: number;
  expireDate: string | null;
  tag: string | null;
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return `***${phone.slice(-4)}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

function toRial(amount: number, amountInToman: boolean): number {
  return amountInToman ? amount * 10 : amount;
}

/** Epoch milliseconds (or seconds) and ISO strings. */
function toIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const numeric = asNumber(value);
  if (numeric != null) {
    if (numeric <= 0) return null;
    const ms = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function toEpochMs(value: unknown): number | null {
  const iso = toIso(value);
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function requirePhone(user: CreditUser): string {
  if (!isIranianMobile(user.phone ?? "")) {
    throw new CreditAdapterError(
      "USER_NOT_FOUND",
      "شماره موبایل کاربر برای سرویس پینکت نامعتبر است",
      404,
    );
  }
  const canonical = normalizePhone(user.phone);
  return `0${canonical.slice(2)}`;
}

function errorDetail(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body.trim();
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "detail", "title", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

function mapAxiosError(error: unknown): never {
  if (error instanceof CreditAdapterError) throw error;

  const ax = error as AxiosError;
  const status = ax.response?.status;
  const detail = errorDetail(ax.response?.data, ax.message || "Pinket unavailable");

  logCreditError("Pinket HTTP error", {
    step: "pinket.http",
    status,
    detail,
    url: ax.config?.url,
    code: ax.code,
  });

  if (status === 401 || status === 403) {
    throw new CreditAdapterError("UNAUTHORIZED", detail || "کلید سازمان پینکت نامعتبر است", 502);
  }
  if (status === 404) {
    throw new CreditAdapterError("USER_NOT_FOUND", detail || "عضو در سازمان پینکت یافت نشد", 404);
  }
  if (status === 400) {
    throw new CreditAdapterError(
      "UNAVAILABLE",
      detail || "شماره موبایل یا پارامترهای صفحه‌بندی پینکت نامعتبر است",
      502,
    );
  }
  if (
    ax.code === "ECONNABORTED" ||
    ax.code === "ETIMEDOUT" ||
    ax.code === "ECONNREFUSED" ||
    ax.code === "ENOTFOUND" ||
    /timeout/i.test(ax.message || "")
  ) {
    throw new CreditAdapterError(
      "UNAVAILABLE",
      `اتصال به سرور پینکت برقرار نشد (${ax.code || "timeout"})`,
      502,
    );
  }
  throw new CreditAdapterError("UNAVAILABLE", detail || "Pinket unavailable", 502);
}

async function pinketGet<T>(
  config: PinketConfig,
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  try {
    const { data } = await axios.get<T>(url, {
      params,
      headers: {
        "X-Organization-Api-Key": config.apiKey,
        Accept: "application/json",
      },
      timeout: config.timeoutMs,
    });
    return data;
  } catch (error) {
    mapAxiosError(error);
  }
}

function extractWallets(payload: unknown): PinketWallet[] {
  if (!Array.isArray(payload)) {
    throw new CreditAdapterError("INVALID_RESPONSE", "پاسخ کیف پول پینکت نامعتبر است", 502);
  }
  return payload.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new CreditAdapterError("INVALID_RESPONSE", `کیف پول پینکت نامعتبر است (#${index})`, 502);
    }
    const data = row as Record<string, unknown>;
    const balance = asNumber(data.balance);
    if (balance === null) {
      throw new CreditAdapterError("INVALID_RESPONSE", `مانده کیف پول پینکت نامعتبر است (#${index})`, 502);
    }
    const expendable = asNumber(data.expendableBalance);
    return {
      uid: data.uid != null ? String(data.uid) : `wallet-${index}`,
      balance,
      expendableBalance: expendable ?? 0,
      expireDate: toIso(data.expireDate),
      tag: typeof data.tag === "string" ? data.tag : null,
    };
  });
}

function mapBalance(wallets: PinketWallet[], amountInToman: boolean): CreditBalance {
  const available = wallets.reduce((sum, wallet) => sum + wallet.expendableBalance, 0);
  const total = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
  const expiries = wallets
    .map((wallet) => wallet.expireDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    available: toRial(available, amountInToman),
    total: toRial(total, amountInToman),
    currency: "IRR",
    expiresAt: expiries[0] ?? null,
  };
}

function mapTransactionType(type: string, signedAmount: number): CreditTransactionType {
  const normalized = type.toLowerCase();
  if (normalized.includes("refund") || normalized.includes("return") || normalized.includes("cancel")) {
    return "REFUND";
  }
  if (normalized.includes("installment")) return "INSTALLMENT_PAYMENT";
  if (
    normalized.includes("charge") ||
    normalized.includes("deposit") ||
    normalized.includes("topup") ||
    normalized.includes("credit")
  ) {
    return "CHARGE";
  }
  if (normalized.includes("order") || normalized.includes("purchase") || normalized.includes("payment")) {
    return "PURCHASE";
  }
  if (signedAmount < 0) return "PURCHASE";
  if (signedAmount > 0) return "CHARGE";
  return "OTHER";
}

function transactionDescription(type: string): string | null {
  const normalized = type.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "orderregistration") return "ثبت سفارش";
  return type.trim();
}

function mapTransaction(row: unknown, index: number, amountInToman: boolean): CreditTransaction {
  if (!row || typeof row !== "object") {
    throw new CreditAdapterError("INVALID_RESPONSE", `سطر تراکنش پینکت نامعتبر است (#${index})`, 502);
  }
  const data = row as Record<string, unknown>;
  const signed = asNumber(data.amount);
  if (signed === null) {
    throw new CreditAdapterError("INVALID_RESPONSE", `مبلغ تراکنش پینکت نامعتبر است (#${index})`, 502);
  }
  const occurredAt = toIso(data.timeStamp ?? data.timestamp);
  if (!occurredAt) {
    throw new CreditAdapterError("INVALID_RESPONSE", `زمان تراکنش پینکت نامعتبر است (#${index})`, 502);
  }
  const typeName = typeof data.type === "string" ? data.type : "";
  const walletUid = data.walletUid != null ? String(data.walletUid) : "";
  return {
    id: `${occurredAt}:${typeName}:${walletUid}:${signed}:${index}`,
    amount: toRial(Math.abs(signed), amountInToman),
    type: mapTransactionType(typeName, signed),
    status: "SUCCESS",
    description: transactionDescription(typeName),
    occurredAt,
    merchantName: null,
    raw: row,
  };
}

function mapInstallmentStatus(
  status: string,
  dueAtMs: number | null,
  deadlineMs: number | null,
  now = Date.now(),
): CreditInstallment["status"] {
  const normalized = status.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (["paid", "settled", "success", "done", "completed"].includes(normalized)) return "PAID";
  if (normalized === "overdue") return "OVERDUE";

  const pastDeadline = deadlineMs != null && deadlineMs < now;
  const pastDue = dueAtMs != null && dueAtMs <= now;
  if (pastDeadline) return "OVERDUE";
  if (pastDue) return "DUE";
  if (normalized === "due") return "DUE";
  return "UPCOMING";
}

function mapInstallment(row: unknown, index: number, amountInToman: boolean): CreditInstallment {
  if (!row || typeof row !== "object") {
    throw new CreditAdapterError("INVALID_RESPONSE", `سطر قسط پینکت نامعتبر است (#${index})`, 502);
  }
  const data = row as Record<string, unknown>;
  const principal = asNumber(data.amount);
  const commission = asNumber(data.commission) ?? 0;
  const penalty = asNumber(data.penalty) ?? 0;
  const total = asNumber(data.totalAmount) ?? (principal === null ? null : principal + commission + penalty);
  if (total === null) {
    throw new CreditAdapterError("INVALID_RESPONSE", `مبلغ قسط پینکت نامعتبر است (#${index})`, 502);
  }
  const dueAt = toIso(data.dueDate) ?? toIso(data.deadlineDate);
  if (!dueAt) {
    throw new CreditAdapterError("INVALID_RESPONSE", `سررسید قسط پینکت نامعتبر است (#${index})`, 502);
  }
  const number = asNumber(data.number);
  const status = typeof data.status === "string" ? data.status : "";
  return {
    id: data.uid != null ? String(data.uid) : `installment-${index}`,
    amount: toRial(total, amountInToman),
    dueAt,
    status: mapInstallmentStatus(status, toEpochMs(data.dueDate), toEpochMs(data.deadlineDate)),
    label: number != null ? `قسط ${number}` : "قسط",
    raw: row,
  };
}

export const pinketCreditAdapter: CreditAdapter = {
  key: "pinket",
  label: "پینکت (Pinket)",
  capabilities: {
    installments: true,
    merchants: false,
    launch: false,
  },
  configSchema: pinketConfigSchema,
  configTemplate: {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: "YOUR_ORG_API_KEY",
    amountInToman: true,
    pageSize: 20,
    timeoutMs: 30000,
  },
  configNotes: [
    "apiKey همان کلید سازمان است و در هدر X-Organization-Api-Key ارسال می‌شود.",
    "baseUrl پیش‌فرض: https://pinket.com/api/v1/organization/members",
    "عضو با شماره موبایل (۰۹…) شناسایی می‌شود و کد ملی لازم نیست.",
    "مبالغ مستند پینکت تومان است و به‌صورت پیش‌فرض به ریال (×۱۰) تبدیل می‌شود. اگر واحد ریال بود amountInToman را false کنید.",
    "pageSize همان پارامتر len است و باید بین ۱ تا ۱۰۰ باشد.",
  ],

  async getBalance(user, rawConfig): Promise<CreditBalance> {
    const config = pinketConfigSchema.parse(rawConfig ?? {});
    const phoneNumber = requirePhone(user);
    logCredit("Pinket getBalance", {
      step: "pinket.getBalance.start",
      userId: user.id,
      phone: maskPhone(phoneNumber),
    });
    const payload = await pinketGet<unknown>(config, "/wallets", { phoneNumber });
    const wallets = extractWallets(payload);
    const balance = mapBalance(wallets, config.amountInToman);
    logCredit("Pinket getBalance done", {
      step: "pinket.getBalance.ok",
      walletCount: wallets.length,
      available: balance.available,
    });
    return balance;
  },

  async getTransactions(user, rawConfig, params): Promise<CursorPage<CreditTransaction>> {
    const config = pinketConfigSchema.parse(rawConfig ?? {});
    const phoneNumber = requirePhone(user);
    const start = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;

    const payload = await pinketGet<unknown>(config, "/transactions", {
      phoneNumber,
      start: safeStart,
      len: config.pageSize,
    });
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new CreditAdapterError("INVALID_RESPONSE", "پاسخ تراکنش پینکت نامعتبر است", 502);
    }
    const body = payload as Record<string, unknown>;
    if (!Array.isArray(body.items)) {
      throw new CreditAdapterError("INVALID_RESPONSE", "فیلد items در پاسخ تراکنش پینکت موجود نیست", 502);
    }
    const items = body.items.map((row, index) => mapTransaction(row, index, config.amountInToman));
    const totalCount = asNumber(body.totalCount);
    const consumed = safeStart + items.length;
    const nextCursor =
      totalCount != null
        ? consumed < totalCount
          ? String(consumed)
          : null
        : items.length >= config.pageSize
          ? String(consumed)
          : null;
    return { items, nextCursor };
  },

  async getInstallments(user, rawConfig): Promise<CreditInstallment[]> {
    const config = pinketConfigSchema.parse(rawConfig ?? {});
    const phoneNumber = requirePhone(user);
    const payload = await pinketGet<unknown>(config, "/installments", { phoneNumber });
    if (!Array.isArray(payload)) {
      throw new CreditAdapterError("INVALID_RESPONSE", "پاسخ اقساط پینکت نامعتبر است", 502);
    }
    return payload.map((row, index) => mapInstallment(row, index, config.amountInToman));
  },
};
