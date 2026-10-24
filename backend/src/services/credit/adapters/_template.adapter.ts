/**
 * Template for a real credit-platform adapter.
 *
 * To add a provider:
 * 1. Copy this file to `<provider-key>.adapter.ts`
 * 2. Implement auth, user identification, and API calls from that provider's docs
 * 3. Map responses into the shared types in `../types.ts`
 * 4. Register the adapter in `../registry.ts`
 *
 * Do not share HTTP clients or auth logic across adapters — each platform differs.
 * This file is documentation only and is not registered in the adapter registry.
 */
import { z } from "zod";
import { CreditAdapterError, type CreditAdapter } from "../types.js";

const configSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
});

export const templateCreditAdapter: CreditAdapter = {
  key: "template",
  label: "Template (do not register)",
  capabilities: {
    installments: false,
    merchants: false,
    launch: false,
  },
  configSchema,

  async getBalance(_user, config) {
    configSchema.parse(config);
    throw new CreditAdapterError("UNAVAILABLE", "Not implemented");
  },

  async getTransactions(_user, config, _params) {
    configSchema.parse(config);
    throw new CreditAdapterError("UNAVAILABLE", "Not implemented");
  },
};
