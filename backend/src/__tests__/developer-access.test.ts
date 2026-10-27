import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    developerPhone: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../lib/prisma.js", () => ({ prisma }));

import {
  addDeveloperPhone,
  clearDeveloperPhoneCache,
  isDeveloperPhone,
  removeDeveloperPhone,
} from "../lib/developer-access.js";
import { normalizePhone } from "../lib/phone.js";
import { AppError } from "../lib/errors.js";

beforeEach(() => {
  vi.clearAllMocks();
  clearDeveloperPhoneCache();
});

describe("normalizePhone", () => {
  it("accepts common Iranian mobile formats", () => {
    expect(normalizePhone("09381333551")).toBe("989381333551");
    expect(normalizePhone("+989381333551")).toBe("989381333551");
    expect(normalizePhone("9381333551")).toBe("989381333551");
    expect(normalizePhone("۰۹۳۸۱۳۳۳۵۵۱")).toBe("989381333551");
  });
});

describe("developer phones", () => {
  it("matches a stored number from a local format", async () => {
    prisma.developerPhone.findMany.mockResolvedValue([{ phone: "989381333551" }]);

    await expect(isDeveloperPhone("09381333551")).resolves.toBe(true);
    expect(prisma.developerPhone.findMany).toHaveBeenCalledWith({ select: { phone: true } });
  });

  it("reads the allowlist once until a phone is added", async () => {
    prisma.developerPhone.findMany.mockResolvedValue([{ phone: "989381333551" }]);

    await isDeveloperPhone("09381333551");
    await isDeveloperPhone("989381333551");
    expect(prisma.developerPhone.findMany).toHaveBeenCalledTimes(1);

    prisma.developerPhone.create.mockResolvedValue({ id: "dev-2", phone: "989131864939" });
    await addDeveloperPhone("09131864939");
    prisma.developerPhone.findMany.mockResolvedValue([
      { phone: "989381333551" },
      { phone: "989131864939" },
    ]);

    await expect(isDeveloperPhone("09131864939")).resolves.toBe(true);
    expect(prisma.developerPhone.findMany).toHaveBeenCalledTimes(2);
  });

  it("stores a normalized number and rejects duplicates", async () => {
    prisma.developerPhone.create.mockResolvedValue({ id: "dev-1", phone: "989381333551" });

    await expect(addDeveloperPhone("0938 133 3551")).resolves.toMatchObject({ phone: "989381333551" });
    expect(prisma.developerPhone.create).toHaveBeenCalledWith({
      data: { phone: "989381333551" },
    });

    prisma.developerPhone.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(addDeveloperPhone("+989381333551")).rejects.toMatchObject({
      message: "این شماره قبلاً ثبت شده است",
      statusCode: 409,
    } satisfies Partial<AppError>);
  });

  it("rejects a number that is not an Iranian mobile", async () => {
    await expect(addDeveloperPhone("12345")).rejects.toMatchObject({
      message: "شماره موبایل نامعتبر است",
      statusCode: 400,
    });
    await expect(addDeveloperPhone("1".repeat(100))).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.developerPhone.create).not.toHaveBeenCalled();
  });

  it("deletes an existing number and reports a missing one", async () => {
    prisma.developerPhone.findUnique.mockResolvedValueOnce({ id: "dev-1", phone: "989381333551" });

    await removeDeveloperPhone("dev-1");
    expect(prisma.developerPhone.delete).toHaveBeenCalledWith({ where: { id: "dev-1" } });

    prisma.developerPhone.findUnique.mockResolvedValueOnce(null);
    await expect(removeDeveloperPhone("missing")).rejects.toMatchObject({
      message: "شماره یافت نشد",
      statusCode: 404,
    });
  });
});
