import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, walletService, signUserToken, smsService } = vi.hoisted(() => ({
  prisma: {
    voucherPlatform: { findUnique: vi.fn() },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    developerPhone: { findMany: vi.fn() },
  },
  walletService: { getUserInfo: vi.fn() },
  signUserToken: vi.fn(() => "jwt-token"),
  smsService: { sendOtp: vi.fn() },
}));

vi.mock("../lib/crypto.js", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("../lib/logger.js", () => ({
  logAuth: vi.fn(),
  logExternalError: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma }));

vi.mock("../services/wallet.service.js", () => ({ walletService }));

vi.mock("../services/sms.service.js", () => ({ smsService }));

vi.mock("../middleware/auth.js", () => ({ signUserToken }));

import { clearDeveloperPhoneCache } from "../lib/developer-access.js";
import { parseLoginPhone } from "../lib/phone.js";
import {
  captchaStoreSize,
  clearCaptchaStore,
  createCaptcha,
  setCaptchaForTests,
  verifyCaptcha,
} from "../services/captcha.service.js";
import {
  authenticateWithWalletToken,
  clearOtpStore,
  requestOtp,
  setOtpForTests,
  verifyOtp,
} from "../services/auth.service.js";
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
  phone: "989120000000",
  nationalCode: null,
};

describe("parseLoginPhone", () => {
  it("converts 10-digit national numbers with 98 prefix", () => {
    expect(parseLoginPhone("9381333554")).toBe("989381333554");
  });

  it("accepts already-canonical numbers", () => {
    expect(parseLoginPhone("989381333554")).toBe("989381333554");
  });

  it("rejects numbers starting with 0", () => {
    expect(() => parseLoginPhone("09381333554")).toThrow(AppError);
    expect(() => parseLoginPhone("09381333554")).toThrow("شماره موبایل نباید با ۰ شروع شود");
  });

  it("rejects wrong lengths", () => {
    expect(() => parseLoginPhone("938133355")).toThrow("شماره موبایل باید ۱۰ رقم باشد");
    expect(() => parseLoginPhone("93813335541")).toThrow("شماره موبایل باید ۱۰ رقم باشد");
  });
});

describe("captcha", () => {
  beforeEach(() => {
    clearCaptchaStore();
  });

  it("creates an SVG challenge", () => {
    const { captchaId, svg } = createCaptcha();
    expect(captchaId).toMatch(/^[a-f0-9]{32}$/);
    expect(svg).toContain("<svg");
    expect(captchaStoreSize()).toBe(1);
  });

  it("verifies a known answer and enforces single-use", () => {
    setCaptchaForTests("cap-1", "AB12C");
    verifyCaptcha("cap-1", "ab12c");
    expect(captchaStoreSize()).toBe(0);
    expect(() => verifyCaptcha("cap-1", "AB12C")).toThrow("کپچا منقضی شده است");
  });

  it("rejects a wrong answer and consumes the challenge", () => {
    setCaptchaForTests("cap-2", "AB12C");
    expect(() => verifyCaptcha("cap-2", "XXXXX")).toThrow("کد کپچا نادرست است");
    expect(captchaStoreSize()).toBe(0);
  });
});

describe("authenticateWithWalletToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDeveloperPhoneCache();
    walletService.getUserInfo.mockResolvedValue(walletUser);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(dbUser);
    prisma.user.update.mockResolvedValue(dbUser);
    prisma.developerPhone.findMany.mockResolvedValue([]);
    signUserToken.mockReturnValue("jwt-token");
  });

  it("uses the global wallet token when no platform slug is provided", async () => {
    await authenticateWithWalletToken("ut-1");

    expect(prisma.voucherPlatform.findUnique).not.toHaveBeenCalled();
    expect(walletService.getUserInfo).toHaveBeenCalledWith("ut-1", undefined);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it("uses the credits wallet token for the credits scope", async () => {
    await authenticateWithWalletToken("ut-1", undefined, "credits");

    expect(prisma.voucherPlatform.findUnique).not.toHaveBeenCalled();
    expect(walletService.getUserInfo).toHaveBeenCalledWith("ut-1", "credits-wallet-token");
  });

  it("prefers the credits wallet token over a platform slug", async () => {
    await authenticateWithWalletToken("ut-1", "spotify", "credits");

    expect(prisma.voucherPlatform.findUnique).not.toHaveBeenCalled();
    expect(walletService.getUserInfo).toHaveBeenCalledWith("ut-1", "credits-wallet-token");
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

  it("upgrades an OTP-created user matched by phone", async () => {
    const otpUser = {
      id: "otp-user",
      walletId: "otp:989120000000",
      name: "",
      family: "",
      phone: "989120000000",
      nationalCode: null,
    };
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // by walletId
      .mockResolvedValueOnce(otpUser); // by phone
    prisma.user.update.mockResolvedValue({
      ...otpUser,
      walletId: "w1",
      name: "Ali",
      family: "Test",
      walletToken: "ut-1",
    });

    const result = await authenticateWithWalletToken("ut-1");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "otp-user" },
        data: expect.objectContaining({
          walletId: "w1",
          phone: "989120000000",
          walletToken: "ut-1",
        }),
      }),
    );
    expect(result.token).toBe("jwt-token");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuses to merge a phone already owned by another wallet account", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "other",
        walletId: "w-other",
        name: "Other",
        family: "User",
        phone: "989120000000",
        nationalCode: null,
      });

    await expect(authenticateWithWalletToken("ut-1")).rejects.toMatchObject({
      message: "این شماره موبایل قبلاً با حساب دیگری ثبت شده است",
      statusCode: 409,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("OTP auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOtpStore();
    clearCaptchaStore();
    clearDeveloperPhoneCache();
    smsService.sendOtp.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "u-otp",
      walletId: "otp:989381333554",
      name: "",
      family: "",
      phone: "989381333554",
      nationalCode: null,
    });
    prisma.developerPhone.findMany.mockResolvedValue([]);
    signUserToken.mockReturnValue("jwt-otp");
  });

  it("requests OTP after captcha validation and enforces 90s cooldown without burning captcha", async () => {
    setCaptchaForTests("c1", "OK123");
    const result = await requestOtp("9381333554", "c1", "OK123");
    expect(result.expiresIn).toBe(90);
    expect(smsService.sendOtp).toHaveBeenCalledWith("989381333554", expect.stringMatching(/^\d{6}$/));

    setCaptchaForTests("c2", "OK456");
    await expect(requestOtp("9381333554", "c2", "OK456")).rejects.toMatchObject({
      statusCode: 429,
    });
    // Cooldown checked before captcha — challenge must remain usable.
    expect(captchaStoreSize()).toBe(1);
    verifyCaptcha("c2", "OK456");
  });

  it("verifies OTP, creates a user, and signs a token", async () => {
    setOtpForTests("989381333554", "123456");

    const result = await verifyOtp("9381333554", "123456");

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        walletId: "otp:989381333554",
        phone: "989381333554",
        name: "",
        family: "",
        walletToken: "",
      },
    });
    expect(result.token).toBe("jwt-otp");
    expect(result.user.phone).toBe("989381333554");
  });

  it("rejects non-6-digit OTP codes", async () => {
    setOtpForTests("989381333554", "123456");
    await expect(verifyOtp("9381333554", "12345")).rejects.toMatchObject({
      message: "کد تایید نامعتبر است",
      statusCode: 400,
    });
  });

  it("rejects expired OTP", async () => {
    setOtpForTests("989381333554", "123456", Date.now() - 1000);

    await expect(verifyOtp("9381333554", "123456")).rejects.toMatchObject({
      message: "کد تایید منقضی شده است. لطفاً دوباره درخواست دهید",
      statusCode: 400,
    });
  });

  it("rejects wrong OTP codes", async () => {
    setOtpForTests("989381333554", "123456");

    await expect(verifyOtp("9381333554", "000000")).rejects.toMatchObject({
      message: "کد تایید نادرست است",
      statusCode: 400,
    });
  });

  it("reuses an existing user found by phone variant", async () => {
    setOtpForTests("989381333554", "654321");
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({
      id: "existing",
      walletId: "w-existing",
      name: "A",
      family: "B",
      phone: "09381333554",
      nationalCode: null,
    });
    prisma.user.update.mockResolvedValue({
      id: "existing",
      walletId: "w-existing",
      name: "A",
      family: "B",
      phone: "989381333554",
      nationalCode: null,
    });

    const result = await verifyOtp("989381333554", "654321");

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
    expect(result.user.id).toBe("existing");
  });
});
