import { AppError } from "./errors.js";
import { normalizeDigits, parseDigitString } from "./digits.js";

const NATIONAL_CODE_PATTERN = /^\d{10}$/;

export function normalizeNationalCode(value: string): string {
  return normalizeDigits(value.trim());
}

export function isValidNationalCode(value?: string | null): boolean {
  if (!value) return false;
  return NATIONAL_CODE_PATTERN.test(normalizeNationalCode(value));
}

export function parseNationalCode(value: string): string {
  const normalized = normalizeNationalCode(value);
  if (!NATIONAL_CODE_PATTERN.test(normalized)) {
    throw new AppError("کد ملی باید ۱۰ رقم باشد", 400);
  }
  return normalized;
}

export function maskMobile(phone: string): string {
  const digits = parseDigitString(phone);
  if (digits.length < 4) return digits;
  return `${digits.slice(-3)}****${digits.slice(2, 5)}`;
}

export function toPublicUser(user: {
  id: string;
  name: string;
  family: string;
  phone: string;
  nationalCode?: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    family: user.family,
    phone: user.phone,
    hasNationalCode: isValidNationalCode(user.nationalCode),
  };
}
