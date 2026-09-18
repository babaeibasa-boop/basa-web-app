import { Prisma } from "@prisma/client";
import { REFTEK_APPS } from "../data/reftek-apps.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertSlug } from "../lib/slug.js";

export interface CreateCategoryInput {
  name: string;
  slug: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  sortOrder?: number;
}

function serializeCategory(category: {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function isUsedByReftekCatalog(slug: string) {
  return REFTEK_APPS.some((app) => app.categorySlug === slug);
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return categories.map(serializeCategory);
}

export async function createCategory(input: CreateCategoryInput) {
  assertSlug(input.slug, "شناسه دسته‌بندی");
  try {
    const category = await prisma.category.create({
      data: {
        name: input.name.trim(),
        slug: input.slug,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return serializeCategory(category);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("این نام یا شناسه دسته‌بندی قبلاً ثبت شده است", 409);
    }
    throw error;
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new AppError("دسته‌بندی یافت نشد", 404);
  if (input.slug) {
    assertSlug(input.slug, "شناسه دسته‌بندی");
    if (input.slug !== existing.slug && isUsedByReftekCatalog(existing.slug)) {
      throw new AppError("شناسه این دسته‌بندی در کاتالوگ RefTek استفاده شده و قابل تغییر نیست", 400);
    }
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return serializeCategory(category);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("این نام یا شناسه دسته‌بندی قبلاً ثبت شده است", 409);
    }
    throw error;
  }
}

export async function deleteCategory(id: string) {
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { voucherPlatforms: true } } },
  });
  if (!existing) throw new AppError("دسته‌بندی یافت نشد", 404);
  if (existing._count.voucherPlatforms > 0) {
    throw new AppError("دسته‌بندی دارای پلتفرم واچر است و قابل حذف نیست", 400);
  }
  if (isUsedByReftekCatalog(existing.slug)) {
    throw new AppError("این دسته‌بندی در کاتالوگ RefTek استفاده شده و قابل حذف نیست", 400);
  }

  await prisma.category.delete({ where: { id } });
}
