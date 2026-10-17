import axios, { type AxiosError } from "axios";
import { z } from "zod";
import { logCredit, logCreditError } from "../../../lib/logger.js";
import {
  CreditAdapterError,
  type CreditAdapter,
  type CreditBalance,
  type CreditTransaction,
  type CreditTransactionStatus,
  type CreditTransactionType,
  type CreditUser,
  type CursorPage,
} from "../types.js";

function maskSecret(value: string | undefined | null, visible = 2): string {
  if (!value) return "(empty)";
  if (value.length <= visible * 2) return "***";
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

function summarizePayload(payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined) return { type: String(payload) };
  if (typeof payload !== "object") return { type: typeof payload, value: payload };
  if (Array.isArray(payload)) return { type: "array", length: payload.length };
  const keys = Object.keys(payload as object);
  return { type: "object", keys, preview: JSON.stringify(payload).slice(0, 500) };
}

/**
 * Barook (بامداد رویان کیان) organizational credit API.
 *
 * Docs: authenticate → balance by nationalCode → paginated transactions.
 * Test base: https://api.barook.tech/barook
 * Prod base: https://gateway.barook.ir
 */
/** Accepts full URLs or host/path forms like `api.barook.tech/barook/`. */
function normalizeBarookBaseUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

const barookConfigSchema = z.object({
  baseUrl: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") {
        return "https://api.barook.tech/barook";
      }
      if (typeof value !== "string") return value;
      return normalizeBarookBaseUrl(value);
    },
    z.string().url(),
  ),
  username: z.string().min(1),
  password: z.string().min(1),
  /** Path segment used in balance/transactions URLs (default from docs: roozeno). */
  organizationSlug: z.string().min(1).default("roozeno"),
  /** Optional pre-auth bearer if Barook requires it on /api/authenticate. */
  authBearer: z.string().optional(),
  pageSize: z.number().int().positive().max(100).default(20),
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
});

type BarookConfig = z.infer<typeof barookConfigSchema>;

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

function cacheKey(config: BarookConfig): string {
  return `${config.baseUrl}|${config.username}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function requireNationalCode(user: CreditUser): string {
  const code = user.nationalCode?.trim();
  logCredit("Barook requireNationalCode", {
    step: "barook.requireNationalCode",
    userId: user.id,
    hasNationalCode: Boolean(code),
    nationalCodeMasked: maskSecret(code, 1),
  });
  if (!code) {
    logCreditError("Barook nationalCode missing on user", {
      step: "barook.requireNationalCode.fail",
      userId: user.id,
      phone: user.phone,
    });
    throw new CreditAdapterError(
      "USER_NOT_FOUND",
      "کد ملی کاربر برای سرویس باروک موجود نیست",
      404,
    );
  }
  return code;
}

function mapAxiosError(error: unknown, step = "barook.axios"): never {
  if (error instanceof CreditAdapterError) throw error;

  const ax = error as AxiosError<{ message?: string; title?: string; detail?: string }>;
  const status = ax.response?.status;
  const body = ax.response?.data;
  const detail =
    (typeof body === "object" && body && (body.message || body.title || body.detail)) ||
    ax.message;

  logCreditError("Barook HTTP error", {
    step,
    status,
    detail: String(detail || ""),
    url: ax.config?.url,
    method: ax.config?.method,
    responsePreview:
      body !== undefined ? JSON.stringify(body).slice(0, 800) : undefined,
    code: ax.code,
    message: ax.message,
  });

  if (status === 401 || status === 403) {
    throw new CreditAdapterError("UNAUTHORIZED", String(detail || "Unauthorized"), 502);
  }
  if (status === 404) {
    throw new CreditAdapterError("USER_NOT_FOUND", String(detail || "Not found"), 404);
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
      `اتصال به سرور باروک برقرار نشد (${ax.code || "timeout"})`,
      502,
    );
  }
  throw new CreditAdapterError("UNAVAILABLE", String(detail || "Barook unavailable"), 502);
}

async function authenticate(config: BarookConfig): Promise<string> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    logCredit("Barook auth token cache hit", {
      step: "barook.authenticate.cacheHit",
      username: config.username,
      expiresInMs: cached.expiresAt - Date.now(),
      tokenMasked: maskSecret(cached.token, 4),
    });
    return cached.token;
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const authUrl = `${baseUrl}/api/authenticate`;
  logCredit("Barook authenticate request", {
    step: "barook.authenticate.request",
    url: authUrl,
    username: config.username,
    passwordMasked: maskSecret(config.password),
    hasAuthBearer: Boolean(config.authBearer),
    timeoutMs: config.timeoutMs,
  });

  try {
    const { data, status } = await axios.post(
      authUrl,
      {
        username: config.username,
        password: config.password,
        rememberMe: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          ...(config.authBearer ? { Authorization: `Bearer ${config.authBearer}` } : {}),
        },
        timeout: config.timeoutMs,
      },
    );

    logCredit("Barook authenticate response", {
      step: "barook.authenticate.response",
      httpStatus: status,
      payload: summarizePayload(data),
    });

    const token =
      (data && typeof data === "object" && typeof (data as { id_token?: unknown }).id_token === "string"
        ? (data as { id_token: string }).id_token
        : null) ||
      (data && typeof data === "object" && typeof (data as { idToken?: unknown }).idToken === "string"
        ? (data as { idToken: string }).idToken
        : null);

    if (!token) {
      logCreditError("Barook authenticate missing id_token", {
        step: "barook.authenticate.noToken",
        payload: summarizePayload(data),
      });
      throw new CreditAdapterError("INVALID_RESPONSE", "توکن احراز هویت باروک دریافت نشد", 502);
    }

    const jwtExp = parseJwtExpiryMs(token);
    tokenCache.set(key, {
      token,
      expiresAt: jwtExp ?? Date.now() + 50 * 60_000,
    });
    logCredit("Barook authenticate succeeded", {
      step: "barook.authenticate.ok",
      tokenMasked: maskSecret(token, 4),
      jwtExp: jwtExp ? new Date(jwtExp).toISOString() : null,
    });
    return token;
  } catch (error) {
    if (error instanceof CreditAdapterError) throw error;
    mapAxiosError(error, "barook.authenticate.error");
  }
}

async function authorizedGet<T>(
  config: BarookConfig,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const url = `${baseUrl}${path}`;
  logCredit("Barook authorized GET start", {
    step: "barook.authorizedGet.start",
    url,
    params,
  });

  const token = await authenticate(config);
  try {
    const { data, status } = await axios.get<T>(url, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: config.timeoutMs,
    });
    logCredit("Barook authorized GET success", {
      step: "barook.authorizedGet.ok",
      url,
      httpStatus: status,
      payload: summarizePayload(data),
    });
    return data;
  } catch (error) {
    const ax = error as AxiosError;
    logCreditError("Barook authorized GET failed", {
      step: "barook.authorizedGet.fail",
      url,
      status: ax.response?.status,
      message: ax.message,
    });
    if (ax.response?.status === 401) {
      logCredit("Barook token expired; clearing cache and retrying", {
        step: "barook.authorizedGet.retryAuth",
        url,
      });
      tokenCache.delete(cacheKey(config));
      const retryToken = await authenticate(config);
      try {
        const { data, status } = await axios.get<T>(url, {
          params,
          headers: {
            Authorization: `Bearer ${retryToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: config.timeoutMs,
        });
        logCredit("Barook authorized GET retry success", {
          step: "barook.authorizedGet.retry.ok",
          url,
          httpStatus: status,
          payload: summarizePayload(data),
        });
        return data;
      } catch (retryError) {
        mapAxiosError(retryError, "barook.authorizedGet.retry.error");
      }
    }
    mapAxiosError(error, "barook.authorizedGet.error");
  }
}

function extractBalance(payload: unknown): number {
  logCredit("Barook extractBalance", {
    step: "barook.extractBalance",
    payload: summarizePayload(payload),
  });
  if (typeof payload === "number" && Number.isFinite(payload)) return payload;
  if (typeof payload === "string" && /^-?\d+(\.\d+)?$/.test(payload)) return Number(payload);
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    if (typeof body.balance === "number") return body.balance;
    if (typeof body.balance === "string" && /^-?\d+(\.\d+)?$/.test(body.balance)) {
      return Number(body.balance);
    }
    if (body.data !== undefined) return extractBalance(body.data);
  }
  logCreditError("Barook extractBalance failed", {
    step: "barook.extractBalance.fail",
    payload: summarizePayload(payload),
  });
  throw new CreditAdapterError("INVALID_RESPONSE", "پاسخ مانده اعتبار باروک نامعتبر است", 502);
}

function mapTransactionType(row: Record<string, unknown>): CreditTransactionType {
  const source = String(row.transactionSourceSlug ?? row.transactionSourceTitle ?? "").toLowerCase();
  const type = String(row.transactionType ?? "").toLowerCase();

  if (source.includes("refund") || source.includes("بازگشت")) return "REFUND";
  if (source.includes("deposit") || source.includes("واریز") || type.includes("واریز")) return "CHARGE";
  if (
    source.includes("payment") ||
    source.includes("پرداخت") ||
    type.includes("برداشت") ||
    type.includes("withdraw")
  ) {
    return "PURCHASE";
  }
  if (source.includes("installment") || source.includes("قسط")) return "INSTALLMENT_PAYMENT";
  return "OTHER";
}

function mapTransactionStatus(value: unknown): CreditTransactionStatus {
  const status = String(value ?? "").toUpperCase();
  if (
    status.includes("SUCCESS") ||
    status.includes("DONE") ||
    status.includes("COMPLETED") ||
    status.includes("موفق") ||
    status.includes("تایید") ||
    status.includes("CONFIRMED")
  ) {
    return "SUCCESS";
  }
  if (
    status.includes("FAIL") ||
    status.includes("REJECT") ||
    status.includes("CANCEL") ||
    status.includes("ناموفق") ||
    status.includes("لغو")
  ) {
    return "FAILED";
  }
  return "PENDING";
}

function extractTransactionRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.content)) return body.content;
    if (Array.isArray(body.items)) return body.items;
    if (Array.isArray(body.data)) return body.data;
    if (body.data && typeof body.data === "object") {
      const nested = body.data as Record<string, unknown>;
      if (Array.isArray(nested.content)) return nested.content;
      if (Array.isArray(nested.items)) return nested.items;
    }
  }
  throw new CreditAdapterError("INVALID_RESPONSE", "پاسخ لیست تراکنش باروک نامعتبر است", 502);
}

function mapTransaction(row: unknown): CreditTransaction {
  if (!row || typeof row !== "object") {
    throw new CreditAdapterError("INVALID_RESPONSE", "سطر تراکنش باروک نامعتبر است", 502);
  }
  const data = row as Record<string, unknown>;
  const amountRaw = data.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : NaN;
  if (!Number.isFinite(amount)) {
    throw new CreditAdapterError("INVALID_RESPONSE", "مبلغ تراکنش باروک نامعتبر است", 502);
  }

  const createdAt = data.createdAt;
  const occurredAt =
    typeof createdAt === "string"
      ? new Date(createdAt).toISOString()
      : typeof createdAt === "number"
        ? new Date(createdAt).toISOString()
        : new Date().toISOString();

  const title =
    (typeof data.transactionSourceTitle === "string" && data.transactionSourceTitle) ||
    (typeof data.transactionType === "string" && data.transactionType) ||
    null;

  return {
    id: String(data.id ?? `${data.nationalCode ?? "tx"}-${occurredAt}-${amount}`),
    amount: Math.abs(amount),
    type: mapTransactionType(data),
    status: mapTransactionStatus(data.transactionStatus),
    description: title,
    occurredAt,
    merchantName: null,
    raw: row,
  };
}

export const barookCreditAdapter: CreditAdapter = {
  key: "barook",
  label: "باروک (Barook)",
  capabilities: {
    installments: false,
    merchants: false,
    launch: false,
  },
  configSchema: barookConfigSchema,

  async getBalance(user, rawConfig): Promise<CreditBalance> {
    logCredit("Barook getBalance start", {
      step: "barook.getBalance.start",
      userId: user.id,
      rawConfigKeys:
        rawConfig && typeof rawConfig === "object" ? Object.keys(rawConfig as object) : typeof rawConfig,
    });

    let config: BarookConfig;
    try {
      config = barookConfigSchema.parse(rawConfig ?? {});
    } catch (error) {
      logCreditError("Barook config parse failed", {
        step: "barook.getBalance.configParse",
        error: String(error),
      });
      throw error;
    }

    logCredit("Barook config parsed", {
      step: "barook.getBalance.config",
      baseUrl: config.baseUrl,
      username: config.username,
      organizationSlug: config.organizationSlug,
      timeoutMs: config.timeoutMs,
    });

    const nationalCode = requireNationalCode(user);
    const org = encodeURIComponent(config.organizationSlug);
    const path = `/consumer/organization/users/${org}/balance`;
    logCredit("Barook balance request", {
      step: "barook.getBalance.request",
      path,
      nationalCodeMasked: maskSecret(nationalCode, 1),
    });

    const payload = await authorizedGet<unknown>(config, path, { nationalCode });
    const available = extractBalance(payload);
    logCredit("Barook getBalance done", {
      step: "barook.getBalance.ok",
      available,
    });
    return {
      available,
      currency: "IRR",
      expiresAt: null,
    };
  },

  async getTransactions(user, rawConfig, params): Promise<CursorPage<CreditTransaction>> {
    logCredit("Barook getTransactions start", {
      step: "barook.getTransactions.start",
      userId: user.id,
      cursor: params.cursor ?? null,
    });

    const config = barookConfigSchema.parse(rawConfig ?? {});
    const nationalCode = requireNationalCode(user);
    const pageNumber = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const safePage = Number.isFinite(pageNumber) && pageNumber >= 0 ? pageNumber : 0;
    const org = encodeURIComponent(config.organizationSlug);
    const pageSize = config.pageSize;
    const path = `/consumer/organization/transactions/${org}/${pageSize}/${safePage}`;

    logCredit("Barook transactions request", {
      step: "barook.getTransactions.request",
      path,
      pageSize,
      pageNumber: safePage,
      nationalCodeMasked: maskSecret(nationalCode, 1),
    });

    const payload = await authorizedGet<unknown>(config, path, { nationalCode });
    const rows = extractTransactionRows(payload);
    const items = rows.map(mapTransaction);
    const nextCursor = items.length >= pageSize ? String(safePage + 1) : null;

    logCredit("Barook getTransactions done", {
      step: "barook.getTransactions.ok",
      itemCount: items.length,
      nextCursor,
    });

    return { items, nextCursor };
  },
};
