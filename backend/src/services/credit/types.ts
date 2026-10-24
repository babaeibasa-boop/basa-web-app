import type { z } from "zod";

export type CreditTransactionType =
  | "PURCHASE"
  | "REFUND"
  | "CHARGE"
  | "INSTALLMENT_PAYMENT"
  | "OTHER";

export type CreditTransactionStatus = "SUCCESS" | "PENDING" | "FAILED";

export interface CreditUser {
  id: string;
  walletId: string;
  phone: string;
  name: string;
  family: string;
  /** Required by some providers (e.g. Barook). May be null if wallet did not supply it. */
  nationalCode?: string | null;
}

export interface CreditBalance {
  available: number;
  total?: number;
  currency: string;
  expiresAt?: string | null;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: CreditTransactionType;
  status: CreditTransactionStatus;
  description: string | null;
  occurredAt: string;
  merchantName?: string | null;
  raw?: unknown;
}

export interface CreditInstallment {
  id: string;
  amount: number;
  dueAt: string;
  status: "PAID" | "DUE" | "OVERDUE" | "UPCOMING";
  label?: string | null;
  raw?: unknown;
}

export interface CreditMerchant {
  id: string;
  name: string;
  logoUrl?: string | null;
  category?: string | null;
  url?: string | null;
  raw?: unknown;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface CreditAdapterCapabilities {
  installments: boolean;
  merchants: boolean;
  launch: boolean;
}

export type CreditAdapterErrorCode =
  | "USER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE";

export class CreditAdapterError extends Error {
  constructor(
    public code: CreditAdapterErrorCode,
    message: string,
    public statusCode = 502,
  ) {
    super(message);
    this.name = "CreditAdapterError";
  }
}

export interface CreditAdapter {
  key: string;
  label: string;
  capabilities: CreditAdapterCapabilities;
  configSchema: z.ZodTypeAny;
  getBalance(user: CreditUser, config: unknown): Promise<CreditBalance>;
  getTransactions(
    user: CreditUser,
    config: unknown,
    params: { cursor?: string },
  ): Promise<CursorPage<CreditTransaction>>;
  getInstallments?(user: CreditUser, config: unknown): Promise<CreditInstallment[]>;
  getMerchants?(
    config: unknown,
    params: { cursor?: string; query?: string },
  ): Promise<CursorPage<CreditMerchant>>;
  getLaunchUrl?(user: CreditUser, config: unknown): Promise<string>;
}
