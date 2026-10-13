import axios from "axios";
import { REFTEK_APPS, type ReftekAppDefinition } from "../data/reftek-apps.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

export interface ReftekCatalogItem {
  kind: "app" | "voucher";
  id: string;
  name: string;
  icon: string;
  description: string | null;
  categorySlug: string;
  categoryName: string;
  linkType?: "static" | "dynamic";
  platformSlug?: string;
}

function findApp(appId: string): ReftekAppDefinition {
  const app = REFTEK_APPS.find((item) => item.appId === appId);
  if (!app) {
    throw new AppError("اپلیکیشن یافت نشد", 404);
  }
  return app;
}

export async function listReftekApps(): Promise<ReftekCatalogItem[]> {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      voucherPlatforms: { orderBy: { name: "asc" } },
    },
  });
  const bySlug = new Map(categories.map((category) => [category.slug, category]));

  for (const app of REFTEK_APPS) {
    if (!bySlug.has(app.categorySlug)) {
      logger.warn(
        { category: "reftek", appId: app.appId, categorySlug: app.categorySlug },
        "Skipped RefTek app with unknown category slug",
      );
    }
  }

  const items: ReftekCatalogItem[] = [];

  for (const category of categories) {
    const apps = REFTEK_APPS.filter((app) => app.categorySlug === category.slug).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "fa"),
    );

    for (const app of apps) {
      items.push({
        kind: "app",
        id: app.appId,
        name: app.name,
        icon: app.icon,
        description: app.description ?? null,
        categorySlug: category.slug,
        categoryName: category.name,
        linkType: app.linkType,
      });
    }

    for (const platform of category.voucherPlatforms) {
      items.push({
        kind: "voucher",
        id: platform.id,
        name: platform.name,
        icon: platform.logoUrl,
        description: null,
        categorySlug: category.slug,
        categoryName: category.name,
        platformSlug: platform.slug,
      });
    }
  }

  return items;
}

function extractLaunchUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  if (body.status !== "OK") return null;
  if (!body.data || typeof body.data !== "object") return null;

  const data = body.data as Record<string, unknown>;
  if (typeof data.app_user_url === "string" && data.app_user_url) {
    return data.app_user_url;
  }

  return null;
}

async function resolveDynamicUrl(app: ReftekAppDefinition, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("کاربر یافت نشد", 401);
  }

  try {

    const { data } = await axios.post(
      `${process.env.WEB_APP_API_BASE_URL}`,
      {
        data: {
          app_id: app.webAppId,
          user_id: `${user.walletId}`
        },
        api_version: 1,
        method: "getWebAppUrl"
      }
      ,
      {
        headers: {
          "PWD": `${process.env.WEB_APP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    const url = extractLaunchUrl(data);
    if (!url) {
      throw new AppError("پاسخ نامعتبر از سرویس راه‌اندازی اپلیکیشن", 502);
    }
    return url;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("خطا در دریافت آدرس اپلیکیشن", 502);
  }
}

export async function launchReftekApp(appId: string, userId: string): Promise<{ url: string }> {
  const app = findApp(appId);
  const url = await resolveDynamicUrl(app, userId);
  return { url };
}
