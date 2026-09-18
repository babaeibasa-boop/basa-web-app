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

  if (typeof body.url === "string" && body.url) return body.url;

  if (body.data && typeof body.data === "object") {
    const data = body.data as Record<string, unknown>;
    if (typeof data.url === "string" && data.url) return data.url;
    if (typeof data.launch_url === "string" && data.launch_url) return data.launch_url;
    if (typeof data.launchUrl === "string" && data.launchUrl) return data.launchUrl;
  }

  if (typeof body.launch_url === "string" && body.launch_url) return body.launch_url;
  if (typeof body.launchUrl === "string" && body.launchUrl) return body.launchUrl;

  return null;
}

async function resolveDynamicUrl(app: ReftekAppDefinition, userId: string): Promise<string> {
  if (!app.resolveUrl) {
    throw new AppError("آدرس پویا برای این اپلیکیشن پیکربندی نشده است", 500);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("کاربر یافت نشد", 401);
  }

  try {
    const { data } = await axios.post(
      app.resolveUrl,
      {
        app_id: app.appId,
        user_id: user.walletId,
        phone: user.phone,
      },
      {
        headers: {
          Authorization: `Bearer ${user.walletToken}`,
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

  if (app.linkType === "static") {
    if (!app.url) {
      throw new AppError("آدرس ثابت برای این اپلیکیشن پیکربندی نشده است", 500);
    }
    return { url: app.url };
  }

  const url = await resolveDynamicUrl(app, userId);
  return { url };
}
