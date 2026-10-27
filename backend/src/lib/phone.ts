import { parseDigitString } from "./digits.js";
import { AppError } from "./errors.js";

/** Canonical Iranian mobile: country code 98 plus a 10-digit national number starting with 9. */
const IRANIAN_MOBILE = /^989\d{9}$/;
/** Long enough for +98, spaces, and Persian digits; short enough to ignore pasted junk. */
const MAX_PHONE_INPUT_LENGTH = 32;

/**
 * Normalize a phone to a comparable digits form.
 * Accepts 989381333551, 09381333551, 9381333551, and +989381333551,
 * including Persian digits.
 */
export function normalizePhone(phone: string): string {
  if (!phone || phone.length > MAX_PHONE_INPUT_LENGTH) return "";
  const digits = parseDigitString(phone);
  if (digits.startsWith("98") && digits.length >= 12) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length >= 11) {
    return `98${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith("9")) {
    return `98${digits}`;
  }
  return digits;
}

export function isIranianMobile(phone: string): boolean {
  return IRANIAN_MOBILE.test(normalizePhone(phone));
}

export function parseIranianMobile(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!IRANIAN_MOBILE.test(normalized)) {
    throw new AppError("شماره موبایل نامعتبر است", 400);
  }
  return normalized;
}
