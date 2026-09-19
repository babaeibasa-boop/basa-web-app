import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoucherPurchaseStatus, VoucherStatus } from "@prisma/client";

const { prisma, walletService } = vi.hoisted(() => {
  const prisma = {
    category: {
      findUnique: vi.fn(),
    },
    voucherPlatform: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    voucher: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    voucherPurchase: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    appSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const walletService = {
    requestPayment: vi.fn(),
    settlePayment: vi.fn(),
  };
  return { prisma, walletService };
});

vi.mock("../lib/crypto.js", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("../lib/config.js", () => ({
  config: { walletCallbackUrl: "http://localhost:5173/payment/result" },
}));

vi.mock("../lib/logger.js", () => ({
  logPayment: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma }));

vi.mock("../services/wallet.service.js", () => ({ walletService }));

import {
  createPlatform,
  createPurchase,
  createVoucher,
  getPlatformOffers,
  getUserPurchases,
  groupAvailableOffers,
  importVouchers,
  initiateVoucherPayment,
  verifyVoucherPayment,
  walletCallbackUrlForPlatform,
} from "../services/voucher.service.js";
import { AppError } from "../lib/errors.js";

const future = new Date(Date.now() + 86_400_000);
const category = {
  id: "cat-entertainment",
  name: "سرگرمی، فیلم و سریال",
  slug: "entertainment",
  sortOrder: 6,
};
const platform = {
  id: "p1",
  name: "Spotify",
  slug: "spotify",
  logoUrl: "/spotify.png",
  encryptedApiKey: "enc:platform-pwd",
  categoryId: category.id,
  category,
};

function voucherRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    platformId: "p1",
    amount: 10000n,
    duration: "1",
    expiresAt: future,
    encryptedCode: "enc:SECRET-CODE",
    status: VoucherStatus.AVAILABLE,
    createdAt: new Date(),
    updatedAt: new Date(),
    platform,
    ...overrides,
  };
}

describe("walletCallbackUrlForPlatform", () => {
  it("adds the platform slug to the payment callback", () => {
    expect(walletCallbackUrlForPlatform("http://localhost:5173/payment/result", "spotify")).toBe(
      "http://localhost:5173/payment/result?platform=spotify",
    );
  });
});

describe("groupAvailableOffers", () => {
  it("groups vouchers by duration even when expiration dates differ", () => {
    const later = new Date(future.getTime() + 86_400_000);
    const offers = groupAvailableOffers([
      { amount: 10000n, duration: "1", expiresAt: future },
      { amount: 10000n, duration: "6", expiresAt: future },
      { amount: 10000n, duration: "6", expiresAt: later },
      { amount: 20000n, duration: "6", expiresAt: future },
      { amount: 30000n, duration: "12", expiresAt: future },
      { amount: 30000n, duration: "12", expiresAt: later },
    ]);
    expect(offers).toHaveLength(3);
    expect(offers.map((offer) => offer.duration)).toEqual(["1", "6", "12"]);
    expect(offers[0]).toMatchObject({ duration: "1", amount: "10000", availableCount: 1 });
    expect(offers[1]).toMatchObject({ duration: "6", availableCount: 3 });
    expect(offers[2]).toMatchObject({ duration: "12", amount: "30000", availableCount: 2 });
  });

  it("treats legacy text durations as month counts", () => {
    const offers = groupAvailableOffers([
      { amount: 10000n, duration: "1", expiresAt: future },
      { amount: 10000n, duration: "۱ ماه", expiresAt: future },
      { amount: 20000n, duration: "۶", expiresAt: future },
    ]);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ duration: "1", availableCount: 2 });
    expect(offers[1]).toMatchObject({ duration: "6", availableCount: 1 });
  });

  it("keeps no-expiry groups as null and uses the earliest dated voucher otherwise", () => {
    const later = new Date(future.getTime() + 86_400_000);
    const mixed = groupAvailableOffers([
      { amount: 10000n, duration: "6", expiresAt: later },
      { amount: 10000n, duration: "6", expiresAt: null },
      { amount: 20000n, duration: "12", expiresAt: null },
    ]);
    expect(mixed[0]).toMatchObject({ duration: "6", expiresAt: later.toISOString(), availableCount: 2 });
    expect(mixed[1]).toMatchObject({ duration: "12", expiresAt: null, availableCount: 1 });
  });
});

describe("createPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    prisma.voucherPlatform.findUnique.mockResolvedValue(platform);
    prisma.voucher.findMany.mockResolvedValue([voucherRecord()]);
  });

  it("reserves stock and creates a pending purchase", async () => {
    prisma.voucher.updateMany.mockResolvedValue({ count: 1 });
    prisma.voucherPurchase.findUnique.mockResolvedValue(null);
    prisma.voucherPurchase.create.mockResolvedValue({
      id: "pur1",
      amount: 10000n,
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      createdAt: new Date(),
      updatedAt: new Date(),
      voucher: voucherRecord({ status: VoucherStatus.RESERVED }),
    });

    const result = await createPurchase("user-1", {
      platformSlug: "spotify",
      amount: "10000",
      duration: "1",
    });

    expect(prisma.voucher.findMany).toHaveBeenCalledWith({
      where: {
        platformId: "p1",
        amount: 10000n,
        status: VoucherStatus.AVAILABLE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      orderBy: { createdAt: "asc" },
    });

    expect(prisma.voucher.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: VoucherStatus.AVAILABLE },
      data: { status: VoucherStatus.RESERVED },
    });
    expect(prisma.voucherPurchase.create).toHaveBeenCalled();
    expect(result.status).toBe(VoucherPurchaseStatus.PENDING_PAYMENT);
    expect(result.voucher.code).toBeNull();
  });

  it("reuses a cancelled purchase for the same voucher", async () => {
    prisma.voucher.updateMany.mockResolvedValue({ count: 1 });
    prisma.voucherPurchase.findUnique.mockResolvedValue({
      id: "pur-old",
      userId: "user-0",
      voucherId: "v1",
      amount: 10000n,
      status: VoucherPurchaseStatus.CANCELLED,
      paymentTrackId: "track-old",
      paymentToken: "token-old",
    });
    prisma.voucherPurchase.update.mockResolvedValue({
      id: "pur-old",
      amount: 10000n,
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      createdAt: new Date(),
      updatedAt: new Date(),
      voucher: voucherRecord({ status: VoucherStatus.RESERVED }),
    });

    const result = await createPurchase("user-1", {
      platformSlug: "spotify",
      amount: "10000",
      duration: "1",
    });

    expect(prisma.voucherPurchase.create).not.toHaveBeenCalled();
    expect(prisma.voucherPurchase.update).toHaveBeenCalledWith({
      where: { id: "pur-old" },
      data: {
        userId: "user-1",
        amount: 10000n,
        status: VoucherPurchaseStatus.PENDING_PAYMENT,
        paymentTrackId: null,
        paymentToken: null,
      },
      include: { voucher: { include: { platform: true } } },
    });
    expect(result.id).toBe("pur-old");
    expect(result.status).toBe(VoucherPurchaseStatus.PENDING_PAYMENT);
  });

  it("fails the second reservation when stock is already taken", async () => {
    prisma.voucher.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      createPurchase("user-1", {
        platformSlug: "spotify",
        amount: "10000",
        duration: "1",
      }),
    ).rejects.toMatchObject({ message: "موجودی تمام شد", statusCode: 409 } satisfies Partial<AppError>);
  });
});

describe("getUserPurchases", () => {
  it("hides the code until the purchase is paid", async () => {
    prisma.voucherPurchase.findMany.mockResolvedValue([
      {
        id: "pending",
        amount: 10000n,
        status: VoucherPurchaseStatus.PENDING_PAYMENT,
        createdAt: new Date(),
        updatedAt: new Date(),
        voucher: voucherRecord(),
      },
      {
        id: "paid",
        amount: 10000n,
        status: VoucherPurchaseStatus.PAID,
        createdAt: new Date(),
        updatedAt: new Date(),
        voucher: voucherRecord({ status: VoucherStatus.SOLD }),
      },
    ]);

    const result = await getUserPurchases("user-1");
    expect(prisma.voucherPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      }),
    );
    expect(result[0]?.voucher.code).toBeNull();
    expect(result[1]?.voucher.code).toBe("SECRET-CODE");
  });

  it("filters purchases by platform slug", async () => {
    prisma.voucherPurchase.findMany.mockResolvedValue([]);

    await getUserPurchases("user-1", "spotify");

    expect(prisma.voucherPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", voucher: { platform: { slug: "spotify" } } },
      }),
    );
  });
});

describe("initiateVoucherPayment", () => {
  it("requests payment with the platform PWD", async () => {
    prisma.voucherPurchase.findFirst.mockResolvedValue({
      id: "pur1",
      userId: "user-1",
      amount: 10000n,
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      user: { walletToken: "ut-1" },
      voucher: voucherRecord({ status: VoucherStatus.RESERVED }),
    });
    walletService.requestPayment.mockResolvedValue({
      pay_url: "https://pay.example/1",
      payment_track_id: "track-1",
    });
    prisma.voucherPurchase.update.mockResolvedValue({});

    const result = await initiateVoucherPayment("pur1", "user-1");

    expect(walletService.requestPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        user_token: "ut-1",
        amount: 10000,
        callback_url: "http://localhost:5173/payment/result?platform=spotify",
      }),
      "platform-pwd",
    );
    expect(result.payUrl).toBe("https://pay.example/1");
  });

  it("releases the voucher when the payment link cannot be created", async () => {
    prisma.voucherPurchase.findFirst.mockResolvedValue({
      id: "pur1",
      userId: "user-1",
      voucherId: "v1",
      amount: 10000n,
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      user: { walletToken: "ut-1" },
      voucher: voucherRecord({ status: VoucherStatus.RESERVED }),
    });
    walletService.requestPayment.mockRejectedValue(new AppError("خطا در ایجاد درخواست پرداخت", 502));
    prisma.$transaction.mockImplementation(async (ops: unknown) => ops);
    prisma.voucherPurchase.updateMany.mockResolvedValue({ count: 1 });
    prisma.voucher.updateMany.mockResolvedValue({ count: 1 });

    await expect(initiateVoucherPayment("pur1", "user-1")).rejects.toMatchObject({
      message: "خطا در ایجاد درخواست پرداخت",
      statusCode: 502,
    });

    expect(prisma.voucher.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: VoucherStatus.RESERVED },
      data: { status: VoucherStatus.AVAILABLE },
    });
  });
});

describe("verifyVoucherPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (ops: unknown) => ops);
  });

  it("settles with the platform PWD and marks the voucher sold", async () => {
    prisma.voucherPurchase.findFirst.mockResolvedValue({
      id: "pur1",
      voucherId: "v1",
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      voucher: voucherRecord({ status: VoucherStatus.RESERVED }),
    });
    walletService.settlePayment.mockResolvedValue({ status: "OK", data: { status: "Paid" } });
    prisma.voucherPurchase.update.mockResolvedValue({});
    prisma.voucher.update.mockResolvedValue({});

    const result = await verifyVoucherPayment("track-1", "token-1", "Done");

    expect(walletService.settlePayment).toHaveBeenCalledWith("track-1", "token-1", "platform-pwd");
    expect(result).toEqual({ success: true, type: "voucher", purchaseId: "pur1", platformSlug: "spotify" });
  });

  it("releases stock when the user cancels payment", async () => {
    prisma.voucherPurchase.findFirst.mockResolvedValue({
      id: "pur1",
      voucherId: "v1",
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      voucher: voucherRecord({ status: VoucherStatus.RESERVED }),
    });
    prisma.voucherPurchase.updateMany.mockResolvedValue({ count: 1 });
    prisma.voucher.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyVoucherPayment("track-1", "token-1", "Cancel");

    expect(walletService.settlePayment).not.toHaveBeenCalled();
    expect(prisma.voucher.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: VoucherStatus.RESERVED },
      data: { status: VoucherStatus.AVAILABLE },
    });
    expect(result?.success).toBe(false);
  });
});

describe("normalize voucher duration", () => {
  it("rejects non-numeric duration on purchase", async () => {
    await expect(
      createPurchase("user-1", {
        platformSlug: "spotify",
        amount: "10000",
        duration: "یک ماه",
      }),
    ).rejects.toMatchObject({
      message: "مدت واچر باید تعداد ماه و فقط عدد باشد",
      statusCode: 400,
    } satisfies Partial<AppError>);
  });
});

describe("createVoucher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.voucherPlatform.findUnique.mockResolvedValue(platform);
  });

  it("creates a voucher without an expiration date", async () => {
    prisma.voucher.create.mockResolvedValue(voucherRecord({ expiresAt: null }));

    const result = await createVoucher({
      platformId: "p1",
      amount: "10000",
      duration: "6",
      expiresAt: null,
      code: "CODE-1",
    });

    expect(prisma.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: null,
          duration: "6",
          encryptedCode: "enc:CODE-1",
        }),
      }),
    );
    expect(result.expiresAt).toBeNull();
  });
});

describe("importVouchers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.voucherPlatform.findMany.mockResolvedValue([platform]);
    prisma.voucherPlatform.findUnique.mockResolvedValue(platform);
  });

  it("imports valid rows and reports invalid ones", async () => {
    prisma.voucher.create.mockResolvedValue(voucherRecord({ expiresAt: null }));

    const result = await importVouchers([
      { platform: "spotify", amount: "10000", duration: "6", code: "OK-1" },
      { platform: "missing", amount: "10000", duration: "6", code: "BAD-1" },
      { platform: "spotify", amount: "10000", duration: "abc", code: "BAD-2" },
    ]);

    expect(result.created).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.errors).toEqual([
      { row: 3, message: "پلتفرم یافت نشد" },
      { row: 4, message: "مدت واچر باید تعداد ماه و فقط عدد باشد" },
    ]);
  });
});

describe("getPlatformOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.voucherPlatform.findUnique.mockResolvedValue(platform);
    prisma.voucherPurchase.findMany.mockResolvedValue([]);
  });

  it("hides vouchers expiring within two days when the setting is on", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: "true" });
    prisma.voucher.findMany.mockResolvedValue([]);

    await getPlatformOffers("spotify");

    expect(prisma.voucher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
    const cutoff = (prisma.voucher.findMany.mock.calls[0][0] as { where: { OR: { expiresAt?: { gt: Date } }[] } })
      .where.OR[1]?.expiresAt?.gt as Date;
    expect(cutoff.getTime()).toBeGreaterThan(Date.now() + 47 * 60 * 60 * 1000);
  });

  it("only excludes already expired vouchers when the setting is off", async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: "false" });
    prisma.voucher.findMany.mockResolvedValue([{ amount: 10000n, duration: "6", expiresAt: null }]);

    const result = await getPlatformOffers("spotify");

    const cutoff = (prisma.voucher.findMany.mock.calls[0][0] as { where: { OR: { expiresAt?: { gt: Date } }[] } })
      .where.OR[1]?.expiresAt?.gt as Date;
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(result.offers[0]?.expiresAt).toBeNull();
  });
});

describe("release without expiry", () => {
  it("returns a reserved no-expiry voucher to available stock", async () => {
    prisma.voucherPurchase.findFirst.mockResolvedValue({
      id: "pur1",
      userId: "user-1",
      voucherId: "v1",
      amount: 10000n,
      status: VoucherPurchaseStatus.PENDING_PAYMENT,
      user: { walletToken: "ut-1" },
      voucher: voucherRecord({ status: VoucherStatus.RESERVED, expiresAt: null }),
    });
    walletService.requestPayment.mockRejectedValue(new AppError("خطا در ایجاد درخواست پرداخت", 502));
    prisma.$transaction.mockImplementation(async (ops: unknown) => ops);
    prisma.voucherPurchase.updateMany.mockResolvedValue({ count: 1 });
    prisma.voucher.updateMany.mockResolvedValue({ count: 1 });

    await expect(initiateVoucherPayment("pur1", "user-1")).rejects.toMatchObject({
      message: "خطا در ایجاد درخواست پرداخت",
    });

    expect(prisma.voucher.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: VoucherStatus.RESERVED },
      data: { status: VoucherStatus.AVAILABLE },
    });
  });
});

describe("createPlatform", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.category.findUnique.mockResolvedValue(category);
  });

  it("requires a valid category", async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(
      createPlatform({
        name: "Spotify",
        slug: "spotify",
        logoUrl: "/spotify.png",
        apiKey: "pwd",
        categoryId: "missing",
      }),
    ).rejects.toMatchObject({ message: "دسته‌بندی یافت نشد", statusCode: 404 });
  });

  it("creates a platform in the selected category", async () => {
    const createdAt = new Date();
    prisma.voucherPlatform.create.mockResolvedValue({
      ...platform,
      createdAt,
      updatedAt: createdAt,
    });

    const result = await createPlatform({
      name: "Spotify",
      slug: "spotify",
      logoUrl: "/spotify.png",
      apiKey: "pwd",
      categoryId: category.id,
    });

    expect(prisma.voucherPlatform.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: category.id,
          slug: "spotify",
          encryptedApiKey: "enc:pwd",
        }),
        include: { category: true },
      }),
    );
    expect(result.category).toMatchObject({ id: category.id, slug: "entertainment" });
  });
});
