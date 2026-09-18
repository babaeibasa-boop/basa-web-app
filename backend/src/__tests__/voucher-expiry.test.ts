import { describe, expect, it } from "vitest";
import { toGregorian } from "jalaali-js";
import {
  availableVoucherExpiryWhere,
  parseVoucherExpiresAt,
  TWO_DAYS_MS,
} from "../lib/voucher-expiry.js";
import { AppError } from "../lib/errors.js";

describe("parseVoucherExpiresAt", () => {
  it("returns null for empty values", () => {
    expect(parseVoucherExpiresAt(null)).toBeNull();
    expect(parseVoucherExpiresAt("")).toBeNull();
    expect(parseVoucherExpiresAt("  ")).toBeNull();
  });

  it("parses a Jalali date as the end of that day in Tehran", () => {
    const parsed = parseVoucherExpiresAt("1408/01/01");
    const gregorian = toGregorian(1408, 1, 1);
    expect(parsed?.toISOString()).toBe(
      new Date(Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, 20, 29, 59)).toISOString(),
    );
  });

  it("parses Jalali dates with Persian digits and time", () => {
    const parsed = parseVoucherExpiresAt("۱۴۰۸/۰۱/۰۱ ۱۸:۳۰");
    const gregorian = toGregorian(1408, 1, 1);
    expect(parsed?.toISOString()).toBe(
      new Date(Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, 15, 0, 0)).toISOString(),
    );
  });

  it("rejects invalid dates", () => {
    expect(() => parseVoucherExpiresAt("not-a-date")).toThrow(AppError);
  });
});

describe("availableVoucherExpiryWhere", () => {
  it("uses a two-day cutoff when hiding soon-to-expire vouchers", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const where = availableVoucherExpiryWhere(true, now);
    expect(where.OR[0]).toEqual({ expiresAt: null });
    expect(where.OR[1]?.expiresAt).toEqual({ gt: new Date(now.getTime() + TWO_DAYS_MS) });
  });

  it("uses now as the cutoff when the hide setting is off", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const where = availableVoucherExpiryWhere(false, now);
    expect(where.OR[1]?.expiresAt).toEqual({ gt: now });
  });
});
