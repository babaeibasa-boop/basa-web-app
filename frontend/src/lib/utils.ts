import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return digit;
  });
}

export function parseDigitInput(value: string): string {
  return normalizeDigits(value).replace(/\D/g, "");
}

export function formatAmountInput(digits: string): string {
  if (!digits) return "";
  return new Intl.NumberFormat("fa-IR").format(BigInt(digits));
}

export function formatPrice(amount: string | number): string {
  const num = typeof amount === "string" ? parseInt(amount, 10) : amount;
  return new Intl.NumberFormat("fa-IR").format(num) + " ریال";
}

export function formatDurationMonths(duration: string): string {
  const months = parseDigitInput(duration);
  if (!months || !/^[1-9]\d*$/.test(months)) return duration;
  return `${new Intl.NumberFormat("fa-IR").format(Number(months))} ماهه`;
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(date));
}

export function formatVoucherExpiry(date: string | null | undefined): string {
  if (!date) return "بدون انقضا";
  return formatDate(date);
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAID: "پرداخت شده",
  COMPLETED: "تکمیل شده",
  CANCELLED: "لغو شده",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  PAID: "پرداخت شده",
  CANCELLED: "لغو شده",
  REFUNDED: "بازگشت وجه",
};

export const AI_MODEL_LABELS: Record<string, string> = {
  CHATGPT: "ChatGPT",
  CLAUDE: "Claude",
  GEMINI: "Gemini",
};

export const VOUCHER_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "موجود",
  RESERVED: "رزرو شده",
  SOLD: "فروخته شده",
  CANCELLED: "لغو شده",
};

export const VOUCHER_PURCHASE_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAID: "پرداخت شده",
  CANCELLED: "لغو شده",
};

const ALLOWED_REDIRECT_PREFIXES = ["/voucher", "/reftek", "/orders", "/payment"];

export function voucherPlatformSlugFromPath(pathname: string): string | null {
  const path = pathname.split("?")[0] ?? pathname;
  const match = path.match(/^\/voucher\/([^/]+)(?:\/purchases)?$/);
  if (!match?.[1] || match[1] === "purchases") return null;
  return match[1];
}

export function splashLoginSearch(
  ut: string,
  pathname: string,
  currentParams: URLSearchParams,
): string {
  const preserved = new URLSearchParams(currentParams);
  preserved.delete("ut");
  const extra = preserved.toString();
  const redirect = pathname + (extra ? `?${extra}` : "");
  const params = new URLSearchParams();
  params.set("ut", ut);
  params.set("redirect", redirect);
  const platform = voucherPlatformSlugFromPath(pathname) || currentParams.get("platform");
  if (platform) params.set("platform", platform);
  return params.toString();
}

export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return fallback;
  }
  const path = value.split("?")[0] ?? value;
  const allowed = ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  return allowed ? value : fallback;
}
