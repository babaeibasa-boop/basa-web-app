/**
 * Reftek web-app catalog.
 *
 * - static: `url` is used directly when the user launches the app
 * - dynamic: backend calls `resolveUrl` and expects a JSON body with a launch URL
 *   at `url`, `data.url`, or `data.launch_url`
 *
 * Edit this file to add/remove apps. `appId` must be unique.
 */
export type ReftekLinkType = "static" | "dynamic";

export interface ReftekAppDefinition {
  appId: string;
  name: string;
  category: string;
  /** Lucide icon name rendered on the frontend (e.g. "Users", "BarChart3") */
  icon: string;
  description?: string;
  sortOrder?: number;
  linkType: ReftekLinkType;
  /** Required when linkType is "static" */
  url?: string;
  /** Required when linkType is "dynamic" — absolute URL our backend will call */
  resolveUrl?: string;
}

export const REFTEK_APPS: ReftekAppDefinition[] = [
  {
    appId: "hr-portal",
    name: "پورتال منابع انسانی",
    category: "منابع انسانی",
    icon: "Users",
    description: "درخواست مرخصی، احکام و اطلاعات پرسنلی",
    sortOrder: 1,
    linkType: "static",
    url: "https://example.com/hr",
  },
  {
    appId: "attendance",
    name: "حضور و غیاب",
    category: "منابع انسانی",
    icon: "Clock",
    description: "ثبت و مشاهده ساعات کاری",
    sortOrder: 2,
    linkType: "static",
    url: "https://example.com/attendance",
  },
  {
    appId: "finance-desk",
    name: "میز خدمت مالی",
    category: "مالی و اداری",
    icon: "Wallet",
    description: "درخواست‌ها و پیگیری‌های مالی",
    sortOrder: 1,
    linkType: "static",
    url: "https://example.com/finance",
  },
  {
    appId: "procurement",
    name: "سامانه تدارکات",
    category: "مالی و اداری",
    icon: "ShoppingCart",
    description: "ثبت درخواست خرید کالا و خدمات",
    sortOrder: 2,
    linkType: "dynamic",
    resolveUrl: "https://example.com/api/apps/procurement/launch",
  },
  {
    appId: "helpdesk",
    name: "میز خدمت فناوری",
    category: "ابزارهای فنی",
    icon: "Headset",
    description: "ثبت تیکت و پیگیری پشتیبانی",
    sortOrder: 1,
    linkType: "static",
    url: "https://example.com/helpdesk",
  },
  {
    appId: "monitoring",
    name: "مانیتورینگ سرویس‌ها",
    category: "ابزارهای فنی",
    icon: "Activity",
    description: "وضعیت سرویس‌ها و هشدارها",
    sortOrder: 2,
    linkType: "dynamic",
    resolveUrl: "https://example.com/api/apps/monitoring/launch",
  },
];
