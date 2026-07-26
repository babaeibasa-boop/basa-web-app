import axios from "axios";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { REFTEK_APPS, type ReftekAppDefinition } from "../data/reftek-apps.js";

export interface ReftekAppPublic {
  appId: string;
  name: string;
  category: string;
  icon: string;
  description: string | null;
  linkType: "static" | "dynamic";
}

function sortApps(apps: ReftekAppDefinition[]): ReftekAppDefinition[] {
  return [...apps].sort((a, b) => {
    const categoryCmp = a.category.localeCompare(b.category, "fa");
    if (categoryCmp !== 0) return categoryCmp;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "fa");
  });
}

function findApp(appId: string): ReftekAppDefinition {
  const app = REFTEK_APPS.find((item) => item.appId === appId);
  if (!app) {
    throw new AppError("اپلیکیشن یافت نشد", 404);
  }
  return app;
}

function toPublic(app: ReftekAppDefinition): ReftekAppPublic {
  return {
    appId: app.appId,
    name: app.name,
    category: app.category,
    icon: app.icon,
    description: app.description ?? null,
    linkType: app.linkType,
  };
}

export function listReftekApps(): ReftekAppPublic[] {
  return sortApps(REFTEK_APPS).map(toPublic);
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
