import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreditFeatureMode } from "@prisma/client";

const { prisma } = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    creditPlatform: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { prisma };
});

vi.mock("../lib/crypto.js", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("../lib/prisma.js", () => ({ prisma }));

import {
  createCreditPlatform,
  getCreditInstallments,
  getCreditLaunchUrl,
  getCreditMerchants,
  listCreditPlatformsWithBalances,
  updateCreditPlatform,
} from "../services/credit/credit.service.js";
import { AppError } from "../lib/errors.js";
import { CreditAdapterError } from "../services/credit/types.js";
import * as registry from "../services/credit/registry.js";

const user = {
  id: "user-1",
  walletId: "w-1",
  phone: "09120000000",
  name: "علی",
  family: "تست",
};

function platformRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cp-1",
    name: "پلتفرم تست",
    slug: "mock-credit",
    logoUrl: "/logo.png",
    adapterKey: "mock",
    encryptedConfig: "enc:{}",
    installmentsMode: CreditFeatureMode.API,
    installmentsUrl: null,
    merchantsMode: CreditFeatureMode.API,
    merchantsUrl: null,
    launchUrl: "https://fallback.example.com",
    instructions: "دستورالعمل",
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(user);
});

describe("listCreditPlatformsWithBalances", () => {
  it("returns balances for healthy platforms and errors for failed ones", async () => {
    const healthy = platformRow({ id: "cp-1", slug: "ok" });
    const broken = platformRow({ id: "cp-2", slug: "broken", adapterKey: "mock" });
    prisma.creditPlatform.findMany.mockResolvedValue([healthy, broken]);

    const getBalance = vi
      .spyOn(registry.getCreditAdapter("mock"), "getBalance")
      .mockResolvedValueOnce({
        available: 1_000_000,
        currency: "IRR",
      })
      .mockRejectedValueOnce(new CreditAdapterError("USER_NOT_FOUND", "missing", 404));

    const result = await listCreditPlatformsWithBalances(user.id);

    expect(result).toHaveLength(2);
    expect(result[0]?.balance?.available).toBe(1_000_000);
    expect(result[0]?.error).toBeNull();
    expect(result[1]?.balance).toBeNull();
    expect(result[1]?.error).toContain("اعتباری");
    getBalance.mockRestore();
  });
});

describe("feature modes", () => {
  it("returns redirect payload for installments in REDIRECT mode", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(
      platformRow({
        installmentsMode: CreditFeatureMode.REDIRECT,
        installmentsUrl: "https://platform.example.com/installments",
      }),
    );

    const result = await getCreditInstallments(user.id, "mock-credit");
    expect(result).toEqual({
      mode: "redirect",
      url: "https://platform.example.com/installments",
    });
  });

  it("returns api installments for API mode", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(platformRow());
    const result = await getCreditInstallments(user.id, "mock-credit");
    expect(result.mode).toBe("api");
    if (result.mode === "api") {
      expect(result.items.length).toBeGreaterThan(0);
    }
  });

  it("rejects DISABLED installments", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(
      platformRow({ installmentsMode: CreditFeatureMode.DISABLED }),
    );
    await expect(getCreditInstallments(user.id, "mock-credit")).rejects.toBeInstanceOf(AppError);
  });

  it("returns redirect merchants without calling adapter", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(
      platformRow({
        merchantsMode: CreditFeatureMode.REDIRECT,
        merchantsUrl: "https://platform.example.com/merchants",
      }),
    );
    const result = await getCreditMerchants("mock-credit", {});
    expect(result).toEqual({
      mode: "redirect",
      url: "https://platform.example.com/merchants",
    });
  });
});

describe("launch fallback", () => {
  it("falls back to static launchUrl when adapter launch fails", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(platformRow());
    const adapter = registry.getCreditAdapter("mock");
    const originalLaunch = adapter.getLaunchUrl;
    adapter.getLaunchUrl = vi.fn().mockRejectedValue(new Error("down"));

    const result = await getCreditLaunchUrl(user.id, "mock-credit");
    expect(result.url).toBe("https://fallback.example.com");
    adapter.getLaunchUrl = originalLaunch;
  });

  it("uses adapter launch url when available", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(
      platformRow({ launchUrl: null, encryptedConfig: 'enc:{"baseUrl":"https://launch.test"}' }),
    );
    const result = await getCreditLaunchUrl(user.id, "mock-credit");
    expect(result.url).toContain("https://launch.test");
    expect(result.url).toContain(user.phone);
  });
});

describe("admin CRUD validation", () => {
  it("creates a platform with encrypted config", async () => {
    prisma.creditPlatform.create.mockImplementation(async ({ data }) =>
      platformRow({
        ...data,
        id: "new-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const created = await createCreditPlatform({
      name: "Mock Credit",
      slug: "mock-credit",
      logoUrl: "/logo.png",
      adapterKey: "mock",
      config: { apiKey: "secret" },
      installmentsMode: CreditFeatureMode.API,
      merchantsMode: CreditFeatureMode.REDIRECT,
      merchantsUrl: "https://merchants.example.com",
    });

    expect(created.slug).toBe("mock-credit");
    expect(prisma.creditPlatform.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          encryptedConfig: expect.stringMatching(/^enc:/),
          merchantsMode: CreditFeatureMode.REDIRECT,
        }),
      }),
    );
  });

  it("rejects API mode when adapter lacks capability", async () => {
    const adapter = registry.getCreditAdapter("mock");
    const original = adapter.capabilities.installments;
    adapter.capabilities.installments = false;

    await expect(
      createCreditPlatform({
        name: "X",
        slug: "x",
        logoUrl: "/x.png",
        adapterKey: "mock",
        config: {},
        installmentsMode: CreditFeatureMode.API,
      }),
    ).rejects.toBeInstanceOf(AppError);

    adapter.capabilities.installments = original;
  });

  it("allows same adapter key without new config and rejects unknown adapters", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(platformRow());
    prisma.creditPlatform.update.mockImplementation(async ({ data }) =>
      platformRow({ ...data, id: "cp-1" }),
    );

    await expect(updateCreditPlatform("cp-1", { adapterKey: "mock", name: "Updated" })).resolves.toMatchObject({
      name: "Updated",
    });

    await expect(updateCreditPlatform("cp-1", { adapterKey: "missing" })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
