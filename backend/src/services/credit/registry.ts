import { AppError } from "../../lib/errors.js";
import { barookCreditAdapter } from "./adapters/barook.adapter.js";
import { firouzehCreditAdapter } from "./adapters/firouzeh.adapter.js";
import { mockCreditAdapter } from "./adapters/mock.adapter.js";
import type { CreditAdapter } from "./types.js";

const adapters = new Map<string, CreditAdapter>([
  [mockCreditAdapter.key, mockCreditAdapter],
  [barookCreditAdapter.key, barookCreditAdapter],
  [firouzehCreditAdapter.key, firouzehCreditAdapter],
]);

export function listCreditAdapters(): Array<{
  key: string;
  label: string;
  capabilities: CreditAdapter["capabilities"];
  configTemplate: Record<string, unknown>;
  configNotes: string[];
}> {
  return Array.from(adapters.values()).map((adapter) => ({
    key: adapter.key,
    label: adapter.label,
    capabilities: adapter.capabilities,
    configTemplate: adapter.configTemplate,
    configNotes: adapter.configNotes ?? [],
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
