import axios, { type AxiosError } from "axios";
import { z } from "zod";
import { logCredit, logCreditError } from "../../../lib/logger.js";
import {
  CreditAdapterError,
  type CreditAdapter,
  type CreditBalance,
  type CreditTransaction,
  type CreditUser,
  type CursorPage,
} from "../types.js";

/**
 * Firouzeh Digital Open Credit API v2.1.8
 *
 * Auth: Keycloak password / refresh_token grants
 *   POST {authBaseUrl}/realms/firouzeh/protocol/openid-connect/token
 * Wallets:
 *   GET {baseUrl}cf/api/v1/organization/wallet/{national_id}/
 * Purchases (per wallet):
 *   GET {baseUrl}cf/api/v1/organization/wallet/{wallet_id}/purchase/?page=&page_size=
 */

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

/** Accepts full URLs or host/path forms; keeps a single trailing slash for API base. */
function normalizeApiBaseUrl(value: string): string {
  let url = value.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  // Doc paths are relative like `cf/api/v1/...` so base should end with `/`.
  return url.endsWith("/") ? url : `${url}/`;
}

function normalizeAuthBaseUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

const firouzehConfigSchema = z.object({
  /** API host, e.g. https://api.example.com/ */
  baseUrl: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      return normalizeApiBaseUrl(value);
    },
    z.string().url(),
  ),
  /** Keycloak / OpenID host, e.g. https://auth.example.com */
  authBaseUrl: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      return normalizeAuthBaseUrl(value);
    },
    z.string().url(),
  ),
  clientId: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  scope: z.string().min(1).default("openid"),
  /** Prefer CREDIT wallets for balance/transactions (per docs: CREDIT | CASH | LOAN). */
  preferredWalletType: z.enum(["CREDIT", "CASH", "LOAN"]).default("CREDIT"),
  /** Docs: page_size max is 20. */
  pageSize: z.number().int().positive().max(20).default(20),
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
});

type FirouzehConfig = z.infer<typeof firouzehConfigSchema>;

type WalletType = "CREDIT" | "CASH" | "LOAN";
type WalletStatus = "ACTIVE" | "INACTIVE" | "PENDING" | "SUSPEND";

interface FirouzehWallet {
  id: string;
  title: string;
  type: WalletType | string;
  status: WalletStatus | string;
  available_balance: number;
  freeze_balance: number;
  amount: number;
}

interface TokenCacheEntry {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

/** Clears cached access/refresh tokens (used by unit tests). */
export function clearFirouzehTokenCache(): void {
  tokenCache.clear();
}

function cacheKey(config: FirouzehConfig): string {
  return `${config.authBaseUrl}|${config.clientId}|${config.username}`;
}

function requireNationalCode(user: CreditUser): string {
  const code = user.nationalCode?.trim();
  logCredit("Firouzeh requireNationalCode", {
    step: "firouzeh.requireNationalCode",
    userId: user.id,
    hasNationalCode: Boolean(code),
    nationalCodeMasked: maskSecret(code, 1),
  });
  if (!code) {
    logCreditError("Firouzeh nationalCode missing on user", {
      step: "firouzeh.requireNationalCode.fail",
      userId: user.id,
      phone: user.phone,
    });
    throw new CreditAdapterError(
      "USER_NOT_FOUND",
      "کد ملی کاربر برای سرویس فیروزه موجود نیست",
      404,
    );
  }
  return code;
}

function mapAxiosError(error: unknown, step = "firouzeh.axios"): never {
  if (error instanceof CreditAdapterError) throw error;

  const ax = error as AxiosError<{
    message?: string;
    error?: string;
    error_description?: string;
    detail?: string;
  }>;
  const status = ax.response?.status;
  const body = ax.response?.data;
  const detail =
    (typeof body === "object" &&
      body &&
      (body.error_description || body.message || body.error || body.detail)) ||
    ax.message;

  logCreditError("Firouzeh HTTP error", {
    step,
    status,
    detail: String(detail || ""),
    url: ax.config?.url,
    method: ax.config?.method,
    responsePreview: body !== undefined ? JSON.stringify(body).slice(0, 800) : undefined,
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
      `اتصال به سرور فیروزه برقرار نشد (${ax.code || "timeout"})`,
      502,
    );
  }
  throw new CreditAdapterError("UNAVAILABLE", String(detail || "Firouzeh unavailable"), 502);
}

function tokenUrl(config: FirouzehConfig): string {
  return `${config.authBaseUrl}/realms/firouzeh/protocol/openid-connect/token`;
}

async function requestToken(
  config: FirouzehConfig,
  body: URLSearchParams,
  step: string,
): Promise<TokenCacheEntry> {
  const url = tokenUrl(config);
  logCredit("Firouzeh token request", {
    step,
    url,
    clientId: config.clientId,
    username: config.username,
    grantType: body.get("grant_type"),
    timeoutMs: config.timeoutMs,
  });

  try {
    const { data, status } = await axios.post(url, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: config.timeoutMs,
    });

    logCredit("Firouzeh token response", {
      step: `${step}.response`,
      httpStatus: status,
      payload: summarizePayload(data),
    });

    const accessToken =
      data && typeof data === "object" && typeof (data as { access_token?: unknown }).access_token === "string"
        ? (data as { access_token: string }).access_token
        : null;
    if (!accessToken) {
      logCreditError("Firouzeh token missing access_token", {
        step: `${step}.noToken`,
        payload: summarizePayload(data),
      });
      throw new CreditAdapterError("INVALID_RESPONSE", "توکن احراز هویت فیروزه دریافت نشد", 502);
    }

    const expiresIn =
      data && typeof data === "object" && typeof (data as { expires_in?: unknown }).expires_in === "number"
        ? (data as { expires_in: number }).expires_in
        : 300;
    const refreshToken =
      data &&
      typeof data === "object" &&
      typeof (data as { refresh_token?: unknown }).refresh_token === "string"
        ? (data as { refresh_token: string }).refresh_token
        : undefined;

    const entry: TokenCacheEntry = {
      accessToken,
      refreshToken,
      // Refresh a bit before expiry.
      expiresAt: Date.now() + Math.max(30, expiresIn - 30) * 1000,
    };
    tokenCache.set(cacheKey(config), entry);
    logCredit("Firouzeh authenticate succeeded", {
      step: `${step}.ok`,
      tokenMasked: maskSecret(accessToken, 4),
      hasRefreshToken: Boolean(refreshToken),
      expiresAt: new Date(entry.expiresAt).toISOString(),
    });
    return entry;
  } catch (error) {
    if (error instanceof CreditAdapterError) throw error;
    mapAxiosError(error, `${step}.error`);
  }
}

async function authenticate(config: FirouzehConfig): Promise<string> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 5_000) {
    logCredit("Firouzeh auth token cache hit", {
      step: "firouzeh.authenticate.cacheHit",
      username: config.username,
      expiresInMs: cached.expiresAt - Date.now(),
      tokenMasked: maskSecret(cached.accessToken, 4),
    });
    return cached.accessToken;
  }

  if (cached?.refreshToken) {
    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId,
        refresh_token: cached.refreshToken,
      });
      const entry = await requestToken(config, body, "firouzeh.authenticate.refresh");
      return entry.accessToken;
    } catch (error) {
      logCreditError("Firouzeh refresh failed; falling back to password grant", {
        step: "firouzeh.authenticate.refresh.fail",
        error: String(error),
      });
      tokenCache.delete(key);
    }
  }

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    username: config.username,
    password: config.password,
    scope: config.scope,
  });
  const entry = await requestToken(config, body, "firouzeh.authenticate.password");
  return entry.accessToken;
}

async function authorizedGet<T>(
  config: FirouzehConfig,
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = `${config.baseUrl}${path.replace(/^\//, "")}`;
  logCredit("Firouzeh authorized GET start", {
    step: "firouzeh.authorizedGet.start",
    url,
    params,
  });

  const token = await authenticate(config);
  try {
    const { data, status } = await axios.get<T>(url, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      timeout: config.timeoutMs,
    });
    logCredit("Firouzeh authorized GET success", {
      step: "firouzeh.authorizedGet.ok",
      url,
      httpStatus: status,
      payload: summarizePayload(data),
    });
    return data;
  } catch (error) {
    const ax = error as AxiosError;
    logCreditError("Firouzeh authorized GET failed", {
      step: "firouzeh.authorizedGet.fail",
      url,
      status: ax.response?.status,
      message: ax.message,
    });
    if (ax.response?.status === 401) {
      logCredit("Firouzeh token expired; clearing cache and retrying", {
        step: "firouzeh.authorizedGet.retryAuth",
        url,
      });
      tokenCache.delete(cacheKey(config));
      const retryToken = await authenticate(config);
      try {
        const { data, status } = await axios.get<T>(url, {
          params,
          headers: {
            Authorization: `Bearer ${retryToken}`,
            Accept: "application/json",
          },
          timeout: config.timeoutMs,
        });
        logCredit("Firouzeh authorized GET retry success", {
          step: "firouzeh.authorizedGet.retry.ok",
          url,
          httpStatus: status,
          payload: summarizePayload(data),
        });
        return data;
      } catch (retryError) {
        mapAxiosError(retryError, "firouzeh.authorizedGet.retry.error");
      }
    }
    mapAxiosError(error, "firouzeh.authorizedGet.error");
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

function extractWallets(payload: unknown): FirouzehWallet[] {
  let rows: unknown[] | null = null;
  if (Array.isArray(payload)) {
    rows = payload;
  } else if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.data)) rows = body.data;
    else if (Array.isArray(body.items)) rows = body.items;
    else if (Array.isArray(body.results)) rows = body.results;
  }

  if (!rows) {
    logCreditError("Firouzeh extractWallets failed", {
      step: "firouzeh.extractWallets.fail",
      payload: summarizePayload(payload),
    });
    throw new CreditAdapterError("INVALID_RESPONSE", "پاسخ لیست کیف پول فیروزه نامعتبر است", 502);
  }

  return rows.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new CreditAdapterError("INVALID_RESPONSE", `سطر کیف پول فیروزه نامعتبر است (#${index})`, 502);
    }
    const data = row as Record<string, unknown>;
    const id = data.id != null ? String(data.id) : "";
    if (!id) {
      throw new CreditAdapterError("INVALID_RESPONSE", `شناسه کیف پول فیروزه نامعتبر است (#${index})`, 502);
    }
    const available = asNumber(data.available_balance) ?? 0;
    const freeze = asNumber(data.freeze_balance) ?? 0;
    const amount = asNumber(data.amount) ?? available + freeze;
    return {
      id,
      title: typeof data.title === "string" ? data.title : "",
      type: typeof data.type === "string" ? data.type : "",
      status: typeof data.status === "string" ? data.status : "",
      available_balance: available,
      freeze_balance: freeze,
      amount,
    };
  });
}

function selectWallets(wallets: FirouzehWallet[], preferredType: string): FirouzehWallet[] {
  const byType = wallets.filter((w) => String(w.type).toUpperCase() === preferredType);
  const pool = byType.length > 0 ? byType : wallets;
  const active = pool.filter((w) => String(w.status).toUpperCase() === "ACTIVE");
  return active.length > 0 ? active : pool;
}

function pickPrimaryWallet(wallets: FirouzehWallet[], preferredType: string): FirouzehWallet {
  const selected = selectWallets(wallets, preferredType);
  if (selected.length === 0) {
    throw new CreditAdapterError("USER_NOT_FOUND", "کیف پول فعالی برای کاربر در فیروزه یافت نشد", 404);
  }
  return selected[0]!;
}

async function fetchWallets(config: FirouzehConfig, nationalId: string): Promise<FirouzehWallet[]> {
  const path = `cf/api/v1/organization/wallet/${encodeURIComponent(nationalId)}/`;
  const payload = await authorizedGet<unknown>(config, path);
  return extractWallets(payload);
}

function mapTransaction(row: unknown): CreditTransaction {
  if (!row || typeof row !== "object") {
    throw new CreditAdapterError("INVALID_RESPONSE", "سطر تراکنش فیروزه نامعتبر است", 502);
  }
  const data = row as Record<string, unknown>;
  const amount = asNumber(data.amount);
  if (amount === null) {
    throw new CreditAdapterError("INVALID_RESPONSE", "مبلغ تراکنش فیروزه نامعتبر است", 502);
  }

  const createdAt = data.created_at;
  const occurredAt =
    typeof createdAt === "string"
      ? new Date(createdAt).toISOString()
      : typeof createdAt === "number"
        ? new Date(createdAt).toISOString()
        : new Date().toISOString();

  const id =
    data.uuid != null
      ? String(data.uuid)
      : data.id != null
        ? String(data.id)
        : `${occurredAt}-${amount}`;

  // Docs only expose purchase list; refunds are already netted into returned rows.
  return {
    id,
    amount: Math.abs(amount),
    type: amount < 0 ? "REFUND" : "PURCHASE",
    status: "SUCCESS",
    description: null,
    occurredAt,
    merchantName: null,
    raw: row,
  };
}

function extractPurchasePage(payload: unknown): {
  items: CreditTransaction[];
  page: number;
  pageSize: number;
  totalItems: number | null;
} {
  if (!payload || typeof payload !== "object") {
    throw new CreditAdapterError("INVALID_RESPONSE", "پاسخ لیست تراکنش فیروزه نامعتبر است", 502);
  }
  const body = payload as Record<string, unknown>;
  const rawItems = Array.isArray(body.items) ? body.items : null;
  if (!rawItems) {
    throw new CreditAdapterError("INVALID_RESPONSE", "فیلد items در پاسخ فیروزه موجود نیست", 502);
  }

  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : {};
  const page = asNumber(metadata.page) ?? 1;
  const pageSize = asNumber(metadata.page_size) ?? rawItems.length;
  const totalItems = asNumber(metadata.total_items);

  return {
    items: rawItems.map(mapTransaction),
    page,
    pageSize,
    totalItems,
  };
}

/** Cursor format: `page` (1-based) or `walletId:page` when a specific wallet is pinned. */
function parseCursor(cursor: string | undefined): { walletId?: string; page: number } {
  if (!cursor) return { page: 1 };
  const parts = cursor.split(":");
  if (parts.length === 2) {
    const page = Number.parseInt(parts[1]!, 10);
    return {
      walletId: parts[0] || undefined,
      page: Number.isFinite(page) && page >= 1 ? page : 1,
    };
  }
  const page = Number.parseInt(cursor, 10);
  return { page: Number.isFinite(page) && page >= 1 ? page : 1 };
}

function buildCursor(walletId: string, page: number): string {
  return `${walletId}:${page}`;
}

export const firouzehCreditAdapter: CreditAdapter = {
  key: "firouzeh",
  label: "فیروزه (Firouzeh)",
  capabilities: {
    installments: false,
    merchants: false,
    launch: false,
  },
  configSchema: firouzehConfigSchema,

  async getBalance(user, rawConfig): Promise<CreditBalance> {
    logCredit("Firouzeh getBalance start", {
      step: "firouzeh.getBalance.start",
      userId: user.id,
      rawConfigKeys:
        rawConfig && typeof rawConfig === "object" ? Object.keys(rawConfig as object) : typeof rawConfig,
    });

    let config: FirouzehConfig;
    try {
      config = firouzehConfigSchema.parse(rawConfig ?? {});
    } catch (error) {
      logCreditError("Firouzeh config parse failed", {
        step: "firouzeh.getBalance.configParse",
        error: String(error),
      });
      throw error;
    }

    logCredit("Firouzeh config parsed", {
      step: "firouzeh.getBalance.config",
      baseUrl: config.baseUrl,
      authBaseUrl: config.authBaseUrl,
      clientId: config.clientId,
      username: config.username,
      preferredWalletType: config.preferredWalletType,
      timeoutMs: config.timeoutMs,
    });

    const nationalId = requireNationalCode(user);
    const wallets = await fetchWallets(config, nationalId);
    const selected = selectWallets(wallets, config.preferredWalletType);
    if (selected.length === 0) {
      throw new CreditAdapterError("USER_NOT_FOUND", "کیف پول فعالی برای کاربر در فیروزه یافت نشد", 404);
    }

    const available = selected.reduce((sum, w) => sum + w.available_balance, 0);
    const total = selected.reduce((sum, w) => sum + w.amount, 0);

    logCredit("Firouzeh getBalance done", {
      step: "firouzeh.getBalance.ok",
      walletCount: selected.length,
      available,
      total,
    });

    return {
      available,
      total,
      currency: "IRR",
      expiresAt: null,
    };
  },

  async getTransactions(user, rawConfig, params): Promise<CursorPage<CreditTransaction>> {
    logCredit("Firouzeh getTransactions start", {
      step: "firouzeh.getTransactions.start",
      userId: user.id,
      cursor: params.cursor ?? null,
    });

    const config = firouzehConfigSchema.parse(rawConfig ?? {});
    const nationalId = requireNationalCode(user);
    const { walletId: cursorWalletId, page } = parseCursor(params.cursor);

    let walletId = cursorWalletId;
    if (!walletId) {
      const wallets = await fetchWallets(config, nationalId);
      walletId = pickPrimaryWallet(wallets, config.preferredWalletType).id;
    }

    const pageSize = config.pageSize;
    const path = `cf/api/v1/organization/wallet/${encodeURIComponent(walletId)}/purchase/`;

    logCredit("Firouzeh transactions request", {
      step: "firouzeh.getTransactions.request",
      path,
      page,
      pageSize,
      walletId,
      nationalCodeMasked: maskSecret(nationalId, 1),
    });

    const payload = await authorizedGet<unknown>(config, path, {
      page,
      page_size: pageSize,
    });
    const result = extractPurchasePage(payload);

    let nextCursor: string | null = null;
    if (result.totalItems != null) {
      if (page * pageSize < result.totalItems) {
        nextCursor = buildCursor(walletId, page + 1);
      }
    } else if (result.items.length >= pageSize) {
      nextCursor = buildCursor(walletId, page + 1);
    }

    logCredit("Firouzeh getTransactions done", {
      step: "firouzeh.getTransactions.ok",
      itemCount: result.items.length,
      nextCursor,
    });

    return { items: result.items, nextCursor };
  },
};
