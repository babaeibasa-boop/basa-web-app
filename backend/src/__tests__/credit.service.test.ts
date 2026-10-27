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
    developerPhone: {
      findMany: vi.fn(),
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
  getCreditBalance,
  getCreditInstallments,
  getCreditLaunchUrl,
  getCreditMerchants,
  getCreditPlatformDetail,
  listCreditPlatformsWithBalances,
  updateCreditPlatform,
} from "../services/credit/credit.service.js";
import { clearDeveloperPhoneCache } from "../lib/developer-access.js";
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
  clearDeveloperPhoneCache();
  prisma.user.findUnique.mockResolvedValue(user);
  prisma.developerPhone.findMany.mockResolvedValue([]);
});

describe("listCreditPlatformsWithBalances", () => {
  it("returns only platforms with a successful balance", async () => {
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

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("ok");
    expect(result[0]?.balance?.available).toBe(1_000_000);
    expect(result[0]?.error).toBeNull();
    getBalance.mockRestore();
  });

  it("includes platforms with a zero available balance", async () => {
    const zeroBalance = platformRow({ id: "cp-zero", slug: "zero" });
    prisma.creditPlatform.findMany.mockResolvedValue([zeroBalance]);

    const getBalance = vi.spyOn(registry.getCreditAdapter("mock"), "getBalance").mockResolvedValueOnce({
      available: 0,
      currency: "IRR",
    });

    const result = await listCreditPlatformsWithBalances(user.id);

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("zero");
    expect(result[0]?.balance?.available).toBe(0);
    expect(result[0]?.error).toBeNull();
    getBalance.mockRestore();
  });

  it("lists only active platforms for a non-developer", async () => {
    prisma.creditPlatform.findMany.mockResolvedValue([]);

    await listCreditPlatformsWithBalances(user.id);

    expect(prisma.creditPlatform.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it("includes an inactive platform for a developer even when its balance fails", async () => {
    prisma.developerPhone.findMany.mockResolvedValue([{ phone: "989120000000" }]);
    const inactive = platformRow({ id: "cp-off", slug: "off", isActive: false });
    prisma.creditPlatform.findMany.mockResolvedValue([inactive]);

    const getBalance = vi
      .spyOn(registry.getCreditAdapter("mock"), "getBalance")
      .mockRejectedValueOnce(new CreditAdapterError("USER_NOT_FOUND", "missing balance", 404));

    const result = await listCreditPlatformsWithBalances(user.id);

    expect(prisma.creditPlatform.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("off");
    expect(result[0]?.isActive).toBe(false);
    expect(result[0]?.balance).toBeNull();
    expect(result[0]?.error).toBe("missing balance");
    getBalance.mockRestore();
  });

  it("hides upstream connection details when an inactive balance fails unexpectedly", async () => {
    prisma.developerPhone.findMany.mockResolvedValue([{ phone: "989120000000" }]);
    prisma.creditPlatform.findMany.mockResolvedValue([
      platformRow({ id: "cp-off", slug: "off", isActive: false }),
    ]);
    const getBalance = vi
      .spyOn(registry.getCreditAdapter("mock"), "getBalance")
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.8:443"));

    const result = await listCreditPlatformsWithBalances(user.id);

    expect(result[0]?.error).toBe("موجودی در دسترس نیست");
    expect(result[0]?.error).not.toContain("10.0.0.8");
    getBalance.mockRestore();
  });
});

describe("inactive platform access", () => {
  it("hides an inactive platform from a non-developer", async () => {
    prisma.creditPlatform.findUnique.mockResolvedValue(platformRow({ isActive: false }));

    await expect(getCreditPlatformDetail(user.id, "mock-credit")).rejects.toMatchObject({
      message: "پلتفرم اعتبار یافت نشد",
      statusCode: 404,
    });
  });

  it("opens an inactive platform for a developer", async () => {
    prisma.developerPhone.findMany.mockResolvedValue([{ phone: "989120000000" }]);
    prisma.creditPlatform.findUnique.mockResolvedValue(platformRow({ isActive: false }));

    const result = await getCreditPlatformDetail(user.id, "mock-credit");

    expect(result.slug).toBe("mock-credit");
    expect(result.isActive).toBe(false);
  });

  it("does not load the user twice for an inactive platform balance", async () => {
    prisma.developerPhone.findMany.mockResolvedValue([{ phone: "989120000000" }]);
    prisma.creditPlatform.findUnique.mockResolvedValue(platformRow({ isActive: false }));
    const getBalance = vi.spyOn(registry.getCreditAdapter("mock"), "getBalance").mockResolvedValue({
      available: 1,
      currency: "IRR",
    });

    await getCreditBalance(user.id, "mock-credit");

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
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
    const result = await getCreditMerchants(user.id, "mock-credit", {});
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
