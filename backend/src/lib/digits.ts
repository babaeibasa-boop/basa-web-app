export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return digit;
  });
}

export function parseDigitString(value: string): string {
  return normalizeDigits(value).replace(/\D/g, "");
}

export const DURATION_MONTHS_PATTERN = /^[1-9]\d*$/;

export function parseDurationMonths(value: string | number): string {
  return parseDigitString(String(value));
}

export function formatDurationMonths(duration: string): string {
  const months = parseDigitString(duration);
  if (!DURATION_MONTHS_PATTERN.test(months)) return duration;
  return `${Number(months).toLocaleString("fa-IR")} ماه`;
}
