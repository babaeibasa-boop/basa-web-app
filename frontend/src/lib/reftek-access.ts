/** Digits-only Iranian mobiles allowed to open RefTek apps / voucher pages. */
export const REFTEK_ALLOWED_PHONES = ["989381333551"];

/**
 * Normalize phone to a comparable digits form.
 * Accepts 989381333551, 09381333551, +989381333551 → canonical 989… (country code + national).
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
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

const allowedNormalized = new Set(REFTEK_ALLOWED_PHONES.map(normalizePhone));

export function isReftekAccessAllowed(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return allowedNormalized.has(normalizePhone(phone));
}
