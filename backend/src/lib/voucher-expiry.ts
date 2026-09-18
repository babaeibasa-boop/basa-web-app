import { toGregorian, isValidJalaaliDate } from "jalaali-js";
import { AppError } from "./errors.js";
import { normalizeDigits } from "./digits.js";

export const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
const JALALI_YEAR_MIN = 1200;
const JALALI_YEAR_MAX = 1600;

function tehranWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - TEHRAN_OFFSET_MS);
}

function parseExcelSerial(serial: number): Date {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
  return new Date(utc);
}

function parseJalaliOrGregorianParts(
  year: number,
  month: number,
  day: number,
  hour: number | undefined,
  minute: number | undefined,
  second: number | undefined,
  hasTime: boolean,
): Date {
  if (year >= JALALI_YEAR_MIN && year <= JALALI_YEAR_MAX) {
    if (!isValidJalaaliDate(year, month, day)) {
      throw new AppError("تاریخ انقضا نامعتبر است", 400);
    }
    const gregorian = toGregorian(year, month, day);
    return tehranWallTimeToDate(
      gregorian.gy,
      gregorian.gm,
      gregorian.gd,
      hasTime ? (hour ?? 0) : 23,
      hasTime ? (minute ?? 0) : 59,
      hasTime ? (second ?? 0) : 59,
    );
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new AppError("تاریخ انقضا نامعتبر است", 400);
  }

  return tehranWallTimeToDate(
    year,
    month,
    day,
    hasTime ? (hour ?? 0) : 23,
    hasTime ? (minute ?? 0) : 59,
    hasTime ? (second ?? 0) : 59,
  );
}

function parseDateString(raw: string): Date {
  const iso = new Date(raw);
  if (
    !Number.isNaN(iso.getTime()) &&
    (/^\d{4}-\d{2}-\d{2}/.test(raw) || raw.includes("T") || /GMT|UTC|Z$/i.test(raw))
  ) {
    return iso;
  }

  const match = raw.match(
    /^(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (!match) {
    if (!Number.isNaN(iso.getTime())) return iso;
    throw new AppError("تاریخ انقضا نامعتبر است", 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hasTime = match[4] !== undefined;
  return parseJalaliOrGregorianParts(
    year,
    month,
    day,
    match[4] ? Number(match[4]) : undefined,
    match[5] ? Number(match[5]) : undefined,
    match[6] ? Number(match[6]) : undefined,
    hasTime,
  );
}

export function parseVoucherExpiresAt(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AppError("تاریخ انقضا نامعتبر است", 400);
    }
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      return parseExcelSerial(value);
    }
    const fromTimestamp = new Date(value);
    if (Number.isNaN(fromTimestamp.getTime())) {
      throw new AppError("تاریخ انقضا نامعتبر است", 400);
    }
    return fromTimestamp;
  }

  const raw = normalizeDigits(String(value)).trim();
  if (!raw) return null;
  return parseDateString(raw);
}

export function assertExpiryInFuture(expiresAt: Date | null) {
  if (!expiresAt) return;
  if (expiresAt.getTime() <= Date.now()) {
    throw new AppError("تاریخ انقضا باید در آینده باشد", 400);
  }
}

export function isVoucherExpired(expiresAt: Date | null, now = Date.now()) {
  return expiresAt != null && expiresAt.getTime() <= now;
}

export function availableVoucherExpiryWhere(hideExpiringSoon: boolean, now = new Date()) {
  const cutoff = new Date(now.getTime() + (hideExpiringSoon ? TWO_DAYS_MS : 0));
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: cutoff } }],
  };
}
