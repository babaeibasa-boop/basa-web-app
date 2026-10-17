import { z } from "zod";
import type {
  CreditAdapter,
  CreditBalance,
  CreditInstallment,
  CreditMerchant,
  CreditTransaction,
  CreditUser,
  CursorPage,
} from "../types.js";

const mockConfigSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
  })
  .passthrough()
  .default({});

const PAGE_SIZE = 5;

function seedFromUser(user: CreditUser): number {
  let hash = 0;
  for (const ch of user.phone || user.walletId || user.id) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash || 1;
}

function buildTransactions(user: CreditUser): CreditTransaction[] {
  const seed = seedFromUser(user);
  const now = Date.now();
  return Array.from({ length: 12 }, (_, index) => {
    const amount = ((seed % 900) + 100 + index * 37) * 10_000;
    const types = ["PURCHASE", "REFUND", "CHARGE", "INSTALLMENT_PAYMENT", "OTHER"] as const;
    const statuses = ["SUCCESS", "PENDING", "FAILED"] as const;
    return {
      id: `mock-tx-${user.id}-${index + 1}`,
      amount,
      type: types[index % types.length]!,
      status: statuses[index % statuses.length]!,
      description: `تراکنش آزمایشی ${index + 1}`,
      occurredAt: new Date(now - index * 86_400_000).toISOString(),
      merchantName: index % 2 === 0 ? `فروشگاه ${index + 1}` : null,
      raw: { mock: true, index },
    };
  });
}

function buildInstallments(user: CreditUser): CreditInstallment[] {
  const seed = seedFromUser(user);
  const now = Date.now();
  return Array.from({ length: 4 }, (_, index) => {
    const statuses = ["PAID", "DUE", "OVERDUE", "UPCOMING"] as const;
    return {
      id: `mock-inst-${user.id}-${index + 1}`,
      amount: ((seed % 500) + 200 + index * 50) * 10_000,
      dueAt: new Date(now + (index - 1) * 30 * 86_400_000).toISOString(),
      status: statuses[index % statuses.length]!,
      label: `قسط ${index + 1}`,
      raw: { mock: true, index },
    };
  });
}

const MOCK_MERCHANTS: CreditMerchant[] = [
  { id: "m1", name: "دیجی‌کالا", category: "فروشگاه آنلاین", logoUrl: null, url: "https://www.digikala.com" },
  { id: "m2", name: "اسنپ", category: "حمل‌ونقل", logoUrl: null, url: "https://snapp.ir" },
  { id: "m3", name: "اسنپ‌فود", category: "غذا", logoUrl: null, url: "https://snappfood.ir" },
  { id: "m4", name: "تپسی", category: "حمل‌ونقل", logoUrl: null, url: "https://tapsi.ir" },
  { id: "m5", name: "بامیلو", category: "فروشگاه آنلاین", logoUrl: null, url: null },
  { id: "m6", name: "فیلیمو", category: "سرگرمی", logoUrl: null, url: "https://www.filimo.com" },
  { id: "m7", name: "نماوا", category: "سرگرمی", logoUrl: null, url: "https://www.namava.ir" },
];

function paginate<T>(items: T[], cursor?: string): CursorPage<T> {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
  const slice = items.slice(safeStart, safeStart + PAGE_SIZE);
  const next = safeStart + PAGE_SIZE;
  return {
    items: slice,
    nextCursor: next < items.length ? String(next) : null,
  };
}

export const mockCreditAdapter: CreditAdapter = {
  key: "mock",
  label: "Mock (تست)",
  capabilities: {
    installments: true,
    merchants: true,
    launch: true,
  },
  configSchema: mockConfigSchema,

  async getBalance(user, config): Promise<CreditBalance> {
    mockConfigSchema.parse(config ?? {});
    const seed = seedFromUser(user);
    const available = ((seed % 800) + 200) * 100_000;
    return {
      available,
      total: available + 500_000,
      currency: "IRR",
      expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    };
  },

  async getTransactions(user, config, params) {
    mockConfigSchema.parse(config ?? {});
    return paginate(buildTransactions(user), params.cursor);
  },

  async getInstallments(user, config) {
    mockConfigSchema.parse(config ?? {});
    return buildInstallments(user);
  },

  async getMerchants(config, params) {
    mockConfigSchema.parse(config ?? {});
    const query = params.query?.trim().toLowerCase();
    const filtered = query
      ? MOCK_MERCHANTS.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            (m.category?.toLowerCase().includes(query) ?? false),
        )
      : MOCK_MERCHANTS;
    return paginate(filtered, params.cursor);
  },

  async getLaunchUrl(user, config) {
    const parsed = mockConfigSchema.parse(config ?? {});
    const base = parsed.baseUrl?.replace(/\/$/, "") || "https://example.com/credits";
    return `${base}?phone=${encodeURIComponent(user.phone)}&walletId=${encodeURIComponent(user.walletId)}`;
  },
};
