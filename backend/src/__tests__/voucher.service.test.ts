import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoucherPurchaseStatus, VoucherStatus } from "@prisma/client";

const { prisma, walletService } = vi.hoisted(() => {
  const prisma = {
    voucherPlatform: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    voucher: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    voucherPurchase: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
  createPurchase,
  getUserPurchases,
  groupAvailableOffers,
  initiateVoucherPayment,
  verifyVoucherPayment,
  walletCallbackUrlForPlatform,
} from "../services/voucher.service.js";
import { AppError } from "../lib/errors.js";

const future = new Date(Date.now() + 86_400_000);
const platform = {
  id: "p1",
  name: "Spotify",
  slug: "spotify",
  logoUrl: "/spotify.png",
  encryptedApiKey: "enc:platform-pwd",
};

function voucherRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    platformId: "p1",
    amount: 10000n,
    duration: "۱ ماه",
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
  it("groups matching amount, duration, and expiration", () => {
    const offers = groupAvailableOffers([
      { amount: 10000n, duration: "۱ ماه", expiresAt: future },
      { amount: 10000n, duration: "۱ ماه", expiresAt: future },
      { amount: 20000n, duration: "۱ ماه", expiresAt: future },
    ]);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ amount: "10000", availableCount: 2 });
    expect(offers[1]).toMatchObject({ amount: "20000", availableCount: 1 });
  });
});

describe("createPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    prisma.voucherPlatform.findUnique.mockResolvedValue(platform);
    prisma.voucher.findFirst.mockResolvedValue(voucherRecord());
  });

  it("reserves stock and creates a pending purchase", async () => {
    prisma.voucher.updateMany.mockResolvedValue({ count: 1 });
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
      duration: "۱ ماه",
      expiresAt: future.toISOString(),
    });

    expect(prisma.voucher.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: VoucherStatus.AVAILABLE },
      data: { status: VoucherStatus.RESERVED },
    });
    expect(result.status).toBe(VoucherPurchaseStatus.PENDING_PAYMENT);
    expect(result.voucher.code).toBeNull();
  });

  it("fails the second reservation when stock is already taken", async () => {
    prisma.voucher.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      createPurchase("user-1", {
        platformSlug: "spotify",
        amount: "10000",
        duration: "۱ ماه",
        expiresAt: future.toISOString(),
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
    expect(result[0]?.voucher.code).toBeNull();
    expect(result[1]?.voucher.code).toBe("SECRET-CODE");
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
    expect(result).toEqual({ success: true, type: "voucher", purchaseId: "pur1" });
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
