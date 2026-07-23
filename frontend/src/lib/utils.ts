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

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
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
