import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, walletService, signUserToken } = vi.hoisted(() => ({
  prisma: {
    voucherPlatform: { findUnique: vi.fn() },
    user: { upsert: vi.fn() },
  },
  walletService: { getUserInfo: vi.fn() },
  signUserToken: vi.fn(() => "jwt-token"),
}));

vi.mock("../lib/crypto.js", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("../lib/logger.js", () => ({
  logAuth: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma }));

vi.mock("../services/wallet.service.js", () => ({ walletService }));

vi.mock("../middleware/auth.js", () => ({ signUserToken }));

import { authenticateWithWalletToken } from "../services/auth.service.js";
import { AppError } from "../lib/errors.js";

const walletUser = {
  user_id: "w1",
  name: "Ali",
  family: "Test",
  phone: "09120000000",
};

const dbUser = {
  id: "u1",
  walletId: "w1",
  name: "Ali",
  family: "Test",
  phone: "09120000000",
};

describe("authenticateWithWalletToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletService.getUserInfo.mockResolvedValue(walletUser);
    prisma.user.upsert.mockResolvedValue(dbUser);
    signUserToken.mockReturnValue("jwt-token");
  });

  it("uses the global wallet token when no platform slug is provided", async () => {
    await authenticateWithWalletToken("ut-1");

    expect(prisma.voucherPlatform.findUnique).not.toHaveBeenCalled();
    expect(walletService.getUserInfo).toHaveBeenCalledWith("ut-1", undefined);
  });

  it("uses the decrypted platform PWD when a platform slug is provided", async () => {
    prisma.voucherPlatform.findUnique.mockResolvedValue({
      slug: "spotify",
      encryptedApiKey: "enc:platform-pwd",
    });

    await authenticateWithWalletToken("ut-1", "spotify");

    expect(prisma.voucherPlatform.findUnique).toHaveBeenCalledWith({ where: { slug: "spotify" } });
    expect(walletService.getUserInfo).toHaveBeenCalledWith("ut-1", "platform-pwd");
  });

  it("rejects an unknown platform slug", async () => {
    prisma.voucherPlatform.findUnique.mockResolvedValue(null);

    await expect(authenticateWithWalletToken("ut-1", "missing")).rejects.toMatchObject({
      message: "پلتفرم یافت نشد",
      statusCode: 404,
    } satisfies Partial<AppError>);
    expect(walletService.getUserInfo).not.toHaveBeenCalled();
  });
});
