import { AppError } from "../../lib/errors.js";
import { barookCreditAdapter } from "./adapters/barook.adapter.js";
import { mockCreditAdapter } from "./adapters/mock.adapter.js";
import type { CreditAdapter } from "./types.js";

const adapters = new Map<string, CreditAdapter>([
  [mockCreditAdapter.key, mockCreditAdapter],
  [barookCreditAdapter.key, barookCreditAdapter],
]);

export function listCreditAdapters(): Array<{
  key: string;
  label: string;
  capabilities: CreditAdapter["capabilities"];
}> {
  return Array.from(adapters.values()).map((adapter) => ({
    key: adapter.key,
    label: adapter.label,
    capabilities: adapter.capabilities,
  }));
}

export function getCreditAdapter(adapterKey: string): CreditAdapter {
  const adapter = adapters.get(adapterKey);
  if (!adapter) {
    throw new AppError(`آداپتر اعتبار «${adapterKey}» یافت نشد`, 400);
  }
  return adapter;
}

export function hasCreditAdapter(adapterKey: string): boolean {
  return adapters.has(adapterKey);
}
