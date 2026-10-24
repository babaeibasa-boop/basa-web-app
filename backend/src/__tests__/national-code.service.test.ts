import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, axiosMock, config } = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  axiosMock: {
    post: vi.fn(),
  },
  config: {
    nationalCodeMatchUrl: "https://match.example.com/verify",
    nationalCodeMatchToken: "match-token",
  },
}));

vi.mock("axios", () => ({
  default: axiosMock,
}));

vi.mock("../lib/prisma.js", () => ({ prisma }));

vi.mock("../lib/config.js", () => ({ config }));

vi.mock("../lib/logger.js", () => ({
  logCredit: vi.fn(),
  logCreditError: vi.fn(),
  logExternalError: vi.fn(),
}));

import { submitNationalCode } from "../services/national-code.service.js";
import { AppError } from "../lib/errors.js";

const user = {
  id: "u1",
  walletId: "w1",
  phone: "09123456723",
  name: "علی",
  family: "تست",
  nationalCode: null,
};

function matchResponse(matched: boolean, result = 1) {
  return {
    data: {
      result,
      response_body: {
        data: { matched },
        message: matched ? "موفق" : "ناموفق",
        error_code: null,
      },
    },
  };
}

describe("submitNationalCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.nationalCodeMatchUrl = "https://match.example.com/verify";
    config.nationalCodeMatchToken = "match-token";
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockImplementation(async ({ data }: { data: { nationalCode: string } }) => ({
      ...user,
      nationalCode: data.nationalCode,
    }));
  });

  it("saves the national code when the match API confirms it", async () => {
    axiosMock.post.mockResolvedValue(matchResponse(true));

    const result = await submitNationalCode("u1", "۰۰۱۲۳۴۵۶۷۸");

    expect(axiosMock.post).toHaveBeenCalledWith(
      "https://match.example.com/verify",
      { mobile: "09123456723", national_code: "0012345678" },
      {
        headers: { Authorization: "Bearer match-token" },
        timeout: 15_000,
      },
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { nationalCode: "0012345678" },
    });
    expect(result).toEqual({
      id: "u1",
      name: "علی",
      family: "تست",
      phone: "09123456723",
      hasNationalCode: true,
    });
  });

  it("does not save when the national code does not match the mobile", async () => {
    axiosMock.post.mockResolvedValue(matchResponse(false));

    await expect(submitNationalCode("u1", "0012345678")).rejects.toMatchObject({
      message: "کد ملی وارد شده با شماره موبایل 09*****23 مطابقت ندارد",
      statusCode: 400,
    } satisfies Partial<AppError>);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("never calls the match URL for a non-digit or wrong-length value", async () => {
    await expect(submitNationalCode("u1", "12345abcde")).rejects.toMatchObject({
      message: "کد ملی باید ۱۰ رقم باشد",
      statusCode: 400,
    } satisfies Partial<AppError>);
    await expect(submitNationalCode("u1", "123456789")).rejects.toMatchObject({
      message: "کد ملی باید ۱۰ رقم باشد",
      statusCode: 400,
    } satisfies Partial<AppError>);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  it("skips the match API when a valid national code is already stored", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, nationalCode: "0012345678" });

    const result = await submitNationalCode("u1", "9999999999");

    expect(axiosMock.post).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result.hasNationalCode).toBe(true);
  });
});
